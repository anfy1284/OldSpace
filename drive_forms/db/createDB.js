// createDB.js для drive_forms
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const dbSettings = require('../../drive_root/db/dbSettings.json');
const modelsDef = require('./db');
const rootModelsDef = require('../../drive_root/db/db');
const { DEFAULT_VALUES_TABLE } = require('../../drive_root/db/db');
const { processDefaultValues } = require('../../drive_root/globalServerContext');
const { compareSchemas, syncUniqueConstraints } = require('../../drive_root/db/migrationUtils');

// Загружаем конфигурацию и данные
const formsConfig = require('../server_config.json');
const LEVEL = formsConfig.level;
const defaultValuesData = require('./defaultValues.json');
const defaultValues = processDefaultValues(defaultValuesData, LEVEL);

function getSequelizeInstance() {
  return new Sequelize(dbSettings.database, dbSettings.username, dbSettings.password, {
    host: dbSettings.host,
    port: dbSettings.port,
    dialect: dbSettings.dialect,
    logging: false,
  });
}

async function createAll() {
  const sequelize = getSequelizeInstance();
  
  // Собираем все модели: корневые + локальные + из приложений
  const models = {};
  let allModelsDef = [...rootModelsDef, ...modelsDef];

  // Получаем список приложений
  const appsJsonPath = path.resolve(__dirname, '../apps.json');
  let appsList = [];
  try {
    const appsJson = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
    appsList = appsJson.apps || [];
  } catch (e) {
    console.error('Ошибка чтения apps.json:', e);
  }

  // Для каждого приложения ищем db/db.js
  for (const app of appsList) {
    const dbPath = path.resolve(__dirname, `../../apps${app.path}/db/db.js`);
    if (fs.existsSync(dbPath)) {
      try {
        const appModels = require(dbPath);
        if (Array.isArray(appModels)) {
          allModelsDef = allModelsDef.concat(appModels);
          console.log(`Модели из ${dbPath} добавлены.`);
        }
      } catch (e) {
        console.error(`Ошибка require ${dbPath}:`, e);
      }
    }
  }

  // Создаём все модели
  for (const def of allModelsDef) {
    const fields = {};
    for (const [field, opts] of Object.entries(def.fields)) {
      const type = Sequelize.DataTypes[opts.type];
      fields[field] = { ...opts, type };
    }
    models[def.name] = sequelize.define(def.name, fields, { ...def.options, tableName: def.tableName });
  }

  // Начинаем транзакцию для всех операций миграции
  const transaction = await sequelize.transaction();
  
  try {
    console.log('[MIGRATION] Начало проверки схемы базы данных (drive_forms)...');
    
    // Для каждой модели проверяем схему (локальные модели drive_forms + модели приложений)
    const modelsToMigrate = [...modelsDef];
    
    // Добавляем модели из приложений
    for (const app of appsList) {
      const dbPath = path.resolve(__dirname, `../../apps${app.path}/db/db.js`);
      if (fs.existsSync(dbPath)) {
        try {
          const appModels = require(dbPath);
          if (Array.isArray(appModels)) {
            modelsToMigrate.push(...appModels);
          }
        } catch (e) {
          console.error(`Ошибка загрузки моделей из ${dbPath}:`, e);
        }
      }
    }
    
    for (const def of modelsToMigrate) {
      const tableName = def.tableName;
      console.log(`[MIGRATION] Проверка таблицы: ${tableName}`);
      
      const tableExists = await sequelize.getQueryInterface().describeTable(tableName, { transaction }).catch(() => null);
      
      if (!tableExists) {
        console.log(`[MIGRATION] Таблица ${tableName} не существует, будет создана.`);
        await models[def.name].sync({ transaction });
        console.log(`[MIGRATION] Таблица ${tableName} создана.`);
        continue;
      }
      
      const currentSchema = tableExists;
      const desiredSchema = def.fields;

      const cmp = await compareSchemas(currentSchema, desiredSchema);
      let needsMigration = cmp.needsMigration;
      const differences = cmp.differences;

      // Если миграция не нужна — синхронизируем уникальные ограничения и переходим дальше
      if (!needsMigration) {
        console.log(`[MIGRATION] Таблица ${tableName} соответствует схеме, изменений не требуется.`);
        await syncUniqueConstraints(sequelize, transaction, tableName, desiredSchema);
        continue;
      }
      
      console.log(`[MIGRATION] Таблица ${tableName} требует миграции:`);
      differences.forEach(diff => console.log(`  ${diff}`));
      
      const tempTableName = `${tableName}_temp_backup`;
      console.log(`[MIGRATION] Создание временной таблицы: ${tempTableName}`);
      
      await sequelize.query(
        `CREATE TABLE "${tempTableName}" AS SELECT * FROM "${tableName}"`,
        { transaction }
      );
      console.log(`[MIGRATION] Данные скопированы во временную таблицу.`);
      
      await sequelize.query(`DROP TABLE "${tableName}" CASCADE`, { transaction });
      console.log(`[MIGRATION] Старая таблица удалена.`);
      
      await models[def.name].sync({ transaction });
      console.log(`[MIGRATION] Новая таблица создана по актуальной схеме.`);
      await syncUniqueConstraints(sequelize, transaction, tableName, desiredSchema);
      
      const commonFields = Object.keys(desiredSchema).filter(field => currentSchema[field]);
      
      if (commonFields.length > 0) {
        // Копируем данные построчно через Sequelize для автозаполнения timestamps
        const rows = await sequelize.query(`SELECT * FROM "${tempTableName}"`, { 
          transaction, 
          type: Sequelize.QueryTypes.SELECT 
        });
        
        for (const row of rows) {
          const data = {};
          for (const field of commonFields) {
            data[field] = row[field];
          }
          try {
            await models[def.name].create(data, { transaction });
          } catch (rowErr) {
            console.log(`[MIGRATION] Не удалось скопировать строку: ${rowErr.message}`);
          }
        }
        console.log(`[MIGRATION] Данные скопированы обратно (${rows.length} строк, ${commonFields.length} полей).`);
      }
      
      await sequelize.query(`DROP TABLE "${tempTableName}"`, { transaction });
      console.log(`[MIGRATION] Временная таблица удалена.`);
      
      // Сбрасываем sequence для autoIncrement после восстановления данных
      const pkField = Object.keys(desiredSchema).find(key => desiredSchema[key].primaryKey && desiredSchema[key].autoIncrement);
      if (pkField) {
        await sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"${tableName}"', '${pkField}'), COALESCE(MAX("${pkField}"), 1)) FROM "${tableName}"`,
          { transaction }
        );
        console.log(`[MIGRATION] Sequence для ${tableName}.${pkField} сброшена.`);
      }
      
      console.log(`[MIGRATION] Миграция таблицы ${tableName} завершена успешно.`);
    }
    
    // Управление предопределенными данными
    console.log('[MIGRATION] Управление предопределенными данными (drive_forms)...');
    const DefaultValuesModel = models.DefaultValues;
    
    // Собираем systems и access_roles из приложений
    const systemSet = new Set();
    const accessSet = new Set();
    let nextId = 1;
    
    for (const app of appsList) {
      const configPath = path.resolve(__dirname, `../../apps${app.path}/config.json`);
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (Array.isArray(config.system)) {
          config.system.forEach(s => systemSet.add(s));
        }
        if (Array.isArray(config.access)) {
          config.access.forEach(a => accessSet.add(a));
        }
      } catch (e) {
        console.error(`Ошибка чтения ${configPath}:`, e);
      }
    }
    
    // Формируем предопределенные данные формы (база + динамика)
    const formsDynamic = {
      systems: Array.from(systemSet).map(name => ({ id: nextId++, name })),
      access_roles: Array.from(accessSet).map(name => ({ id: nextId++, name }))
    };
    const formsAll = { ...defaultValues };
    for (const [entity, records] of Object.entries(formsDynamic)) {
      if (Array.isArray(records) && records.length > 0) {
        formsAll[entity] = records.map(r => ({ ...r, _level: LEVEL }));
      }
    }

    // Собираем предопределенные данные приложений по отдельным уровням (level = app.name)
    const levelsDefaultValues = { [LEVEL]: formsAll };
    for (const app of appsList) {
      const appDefPath = path.resolve(__dirname, `../../apps${app.path}/db/defaultValues.json`);
      if (fs.existsSync(appDefPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(appDefPath, 'utf8'));
          levelsDefaultValues[app.name] = processDefaultValues(raw, app.name);
        } catch (e) {
          console.error(`Ошибка чтения defaultValues для приложения ${app.name}:`, e.message);
        }
      }
    }

    // Управление предопределенными данными для каждого уровня
    for (const [lvlName, lvlValues] of Object.entries(levelsDefaultValues)) {
      const currentIds = new Set();
      for (const [entity, records] of Object.entries(lvlValues)) {
        if (Array.isArray(records)) {
          records.forEach(r => { if (r.id !== undefined) currentIds.add(r.id); });
        }
      }

      const existingDefs = await DefaultValuesModel.findAll({ where: { level: lvlName }, transaction });
      for (const defVal of existingDefs) {
        if (!currentIds.has(defVal.defaultValueId)) {
          const modelDef = allModelsDef.find(m => m.tableName === defVal.tableName);
            if (modelDef && models[modelDef.name]) {
              await models[modelDef.name].destroy({ where: { id: defVal.recordId }, transaction });
              console.log(`[MIGRATION] Удалена устаревшая запись: ${defVal.tableName}[${defVal.recordId}] (defaultValueId=${defVal.defaultValueId}, level=${lvlName})`);
            }
          await defVal.destroy({ transaction });
        }
      }

      // Добавление/обновление
      for (const [entity, records] of Object.entries(lvlValues)) {
        const modelDef = allModelsDef.find(m => m.tableName === entity);
        if (!modelDef) continue;
        const Model = models[modelDef.name];
        if (!Model) continue;

        for (const record of (Array.isArray(records) ? records : [])) {
          const defaultValueId = record.id;
          if (defaultValueId === undefined) continue;
          const data = { ...record };
          delete data._level;

          const defEntry = await DefaultValuesModel.findOne({ where: { level: lvlName, defaultValueId, tableName: entity }, transaction });
          if (defEntry) {
            const existingRecord = await Model.findOne({ where: { id: defEntry.recordId }, transaction });
            if (existingRecord) {
              const updateData = { ...data };
              delete updateData.id;
              const hasChanges = Object.keys(updateData).some(k => existingRecord[k] !== updateData[k]);
              if (hasChanges) {
                await existingRecord.update(updateData, { transaction });
                console.log(`[MIGRATION] Обновлена предопределенная запись: ${entity}[${existingRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              } else {
                console.log(`[MIGRATION] Предопределенная запись актуальна: ${entity}[${existingRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              }
            } else {
              const newRecord = await Model.create(data, { transaction });
              await defEntry.update({ recordId: newRecord.id }, { transaction });
              console.log(`[MIGRATION] Пересоздана предопределенная запись: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
            }
          } else {
            let recordToRegister;
            if (data.id) {
              recordToRegister = await Model.findOne({ where: { id: data.id }, transaction });
            }
            if (recordToRegister) {
              const updateData = { ...data };
              delete updateData.id;
              const hasChanges = Object.keys(updateData).some(k => recordToRegister[k] !== updateData[k]);
              if (hasChanges) await recordToRegister.update(updateData, { transaction });
              const existingDefVal = await DefaultValuesModel.findOne({ where: { level: lvlName, defaultValueId, tableName: entity }, transaction });
              if (!existingDefVal) {
                await DefaultValuesModel.create({ level: lvlName, defaultValueId, tableName: entity, recordId: recordToRegister.id }, { transaction });
                console.log(`[MIGRATION] Зарегистрирована существующая запись: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              } else {
                console.log(`[MIGRATION] Запись уже зарегистрирована: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              }
            } else {
              const newRecord = await Model.create(data, { transaction });
              const existingDefVal = await DefaultValuesModel.findOne({ where: { level: lvlName, defaultValueId, tableName: entity }, transaction });
              if (!existingDefVal) {
                await DefaultValuesModel.create({ level: lvlName, defaultValueId, tableName: entity, recordId: newRecord.id }, { transaction });
                console.log(`[MIGRATION] Добавлена предопределенная запись: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              } else {
                console.log(`[MIGRATION] Запись уже зарегистрирована (обновлен recordId): ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              }
            }
          }
        }
      }
    }
    
    // После добавления/обновления предопределённых данных сбрасываем sequence для всех автоинкрементных PK
    for (const def of allModelsDef) {
      const pkField = Object.keys(def.fields).find(key => def.fields[key].primaryKey && def.fields[key].autoIncrement);
      if (!pkField) continue;
      const tableName = def.tableName;
      try {
        await sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"${tableName}"', '${pkField}'), COALESCE(MAX("${pkField}"), 1)) FROM "${tableName}"`,
          { transaction }
        );
        // console.log(`[MIGRATION] Sequence обновлена после предопределённых данных: ${tableName}.${pkField}`);
      } catch (e) {
        console.error(`[MIGRATION] Ошибка сброса sequence для ${tableName}.${pkField}:`, e.message);
      }
    }

    await transaction.commit();
    console.log('[MIGRATION] Миграция базы данных (drive_forms) завершена успешно.');
    
  } catch (error) {
    await transaction.rollback();
    console.error('[MIGRATION] ОШИБКА: Миграция отменена, все изменения откатаны.');
    console.error('[MIGRATION] Детали ошибки:', error.message);
    console.error(error.stack);
    throw error;
  }
  
  await sequelize.close();
  console.log('Таблицы drive_forms обновлены.');
}

if (require.main === module) {
  createAll().catch(e => {
    console.error('Ошибка при создании БД (drive_forms):', e);
    process.exit(1);
  });
}
