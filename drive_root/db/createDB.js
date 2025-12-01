
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dbSettings = require('./dbSettings.json');
const modelsDef = require('./db');
const { DEFAULT_VALUES_TABLE } = require('./db');
const { hashPassword } = require('./utilites');
const { processDefaultValues } = require('../globalServerContext');
const { normalizeType } = require('./migrationUtils');

// Загружаем конфигурацию и данные
const rootConfig = require('../../server.config.json');
const LEVEL = rootConfig.level;
const defaultValuesData = require('./defaultValues.json');
const defaultValues = processDefaultValues(defaultValuesData, LEVEL);

async function ensureDatabase() {
  const adminClient = new Client({
    user: dbSettings.username,
    password: dbSettings.password,
    host: dbSettings.host,
    port: dbSettings.port,
    database: 'postgres',
  });
  await adminClient.connect();
  const dbName = dbSettings.database;
  const res = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (res.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`База данных ${dbName} создана.`);
  } else {
    console.log(`База данных ${dbName} уже существует.`);
  }
  await adminClient.end();
}

function getSequelizeInstance() {
  return new Sequelize(dbSettings.database, dbSettings.username, dbSettings.password, {
    host: dbSettings.host,
    port: dbSettings.port,
    dialect: dbSettings.dialect,
    logging: false,
  });
}

async function createAll() {
  await ensureDatabase();
  const sequelize = getSequelizeInstance();
  
  // Генерируем модели
  const models = {};
  for (const def of modelsDef) {
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
    console.log('[MIGRATION] Начало проверки схемы базы данных...');
    
    // Для каждой модели проверяем схему
    for (const def of modelsDef) {
      const tableName = def.tableName;
      console.log(`[MIGRATION] Проверка таблицы: ${tableName}`);
      
      // Получаем описание таблицы из БД
      const tableExists = await sequelize.getQueryInterface().describeTable(tableName, { transaction }).catch(() => null);
      
      if (!tableExists) {
        console.log(`[MIGRATION] Таблица ${tableName} не существует, будет создана.`);
        await models[def.name].sync({ transaction });
        console.log(`[MIGRATION] Таблица ${tableName} создана.`);
        continue;
      }
      
      // Сравниваем схемы
      const currentSchema = tableExists;
      const desiredSchema = def.fields;
      
      let needsMigration = false;
      const differences = [];
      
      // Проверяем существующие поля
      for (const [fieldName, fieldDef] of Object.entries(desiredSchema)) {
        if (!currentSchema[fieldName]) {
          differences.push(`+ Добавлено поле: ${fieldName}`);
          needsMigration = true;
        } else {
          // Проверяем тип данных
          const currentTypeNorm = normalizeType(currentSchema[fieldName].type);
          const desiredTypeNorm = (Sequelize.DataTypes[fieldDef.type].key || fieldDef.type).toUpperCase();
          // Считаем совместимыми типы STRING/VARCHAR/TEXT, DATE/TIMESTAMP и т.п.
          if (currentTypeNorm !== desiredTypeNorm) {
            differences.push(`~ Изменен тип поля ${fieldName}: ${currentSchema[fieldName].type} -> ${desiredTypeNorm}`);
            needsMigration = true;
          }
        }
      }
      
      // Проверяем удаленные поля
      for (const fieldName of Object.keys(currentSchema)) {
        if (!desiredSchema[fieldName] && !['createdAt', 'updatedAt'].includes(fieldName)) {
          differences.push(`- Удалено поле: ${fieldName}`);
          needsMigration = true;
        }
      }
      
      if (!needsMigration) {
        console.log(`[MIGRATION] Таблица ${tableName} соответствует схеме, изменений не требуется.`);
        continue;
      }
      
      console.log(`[MIGRATION] Таблица ${tableName} требует миграции:`);
      differences.forEach(diff => console.log(`  ${diff}`));
      
      // Миграция: копируем данные, пересоздаем таблицу
      const tempTableName = `${tableName}_temp_backup`;
      console.log(`[MIGRATION] Создание временной таблицы: ${tempTableName}`);
      
      // Копируем данные во временную таблицу
      await sequelize.query(
        `CREATE TABLE "${tempTableName}" AS SELECT * FROM "${tableName}"`,
        { transaction }
      );
      console.log(`[MIGRATION] Данные скопированы во временную таблицу.`);
      
      // Удаляем старую таблицу
      await sequelize.query(`DROP TABLE "${tableName}" CASCADE`, { transaction });
      console.log(`[MIGRATION] Старая таблица удалена.`);
      
      // Создаем новую таблицу по актуальной схеме
      await models[def.name].sync({ transaction });
      console.log(`[MIGRATION] Новая таблица создана по актуальной схеме.`);
      
      // Копируем данные обратно (только совпадающие поля)
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
      
      // Удаляем временную таблицу
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
    console.log('[MIGRATION] Управление предопределенными данными...');
    const DefaultValuesModel = models.DefaultValues;
    
    // Собираем все defaultValueId текущего уровня из defaultValues
    const currentLevelIds = new Set();
    for (const [entity, records] of Object.entries(defaultValues)) {
      if (Array.isArray(records)) {
        records.forEach(record => {
          if (record.id !== undefined) {
            currentLevelIds.add(record.id);
          }
        });
      }
    }
    
    // Удаляем записи, которых нет в текущем уровне
    const existingDefaults = await DefaultValuesModel.findAll({
      where: { level: LEVEL },
      transaction
    });
    
    for (const defValue of existingDefaults) {
      if (!currentLevelIds.has(defValue.defaultValueId)) {
        // Удаляем запись из основной таблицы
        const modelDef = modelsDef.find(m => m.tableName === defValue.tableName);
        if (modelDef && models[modelDef.name]) {
          await models[modelDef.name].destroy({
            where: { id: defValue.recordId },
            transaction
          });
          console.log(`[MIGRATION] Удалена устаревшая запись: ${defValue.tableName}[${defValue.recordId}] (defaultValueId=${defValue.defaultValueId})`);
        }
        // Удаляем запись из DEFAULT_VALUES_TABLE
        await defValue.destroy({ transaction });
      }
    }
    
    // Добавляем или обновляем предопределенные данные
    for (const [entity, records] of Object.entries(defaultValues)) {
      const modelDef = modelsDef.find(m => m.tableName === entity);
      if (!modelDef) continue;
      const Model = models[modelDef.name];
      if (!Model) continue;
      
      for (const record of records) {
        const defaultValueId = record.id;
        if (defaultValueId === undefined) continue;
        
        let data = { ...record };
        delete data._level; // Удаляем служебное поле
        
        // Специфичная обработка для users
        if (entity === 'users') {
          if (data.username) {
            data.name = data.username;
            delete data.username;
          }
          if (data.password) {
            data.password_hash = await hashPassword(data.password);
            delete data.password;
          }
        }
        
        // Ищем запись в DEFAULT_VALUES_TABLE
        const defaultValueEntry = await DefaultValuesModel.findOne({
          where: {
            level: LEVEL,
            defaultValueId: defaultValueId,
            tableName: entity
          },
          transaction
        });
        
        if (defaultValueEntry) {
          // Запись существует в DefaultValues — обновляем данные
          const existingRecord = await Model.findOne({
            where: { id: defaultValueEntry.recordId },
            transaction
          });
          
          if (existingRecord) {
            await existingRecord.update(data, { transaction });
            console.log(`[MIGRATION] Обновлена предопределенная запись: ${entity}[${existingRecord.id}] (defaultValueId=${defaultValueId})`);
          } else {
            // Записи нет в основной таблице — создаем заново
            const newRecord = await Model.create(data, { transaction });
            await defaultValueEntry.update({ recordId: newRecord.id }, { transaction });
            console.log(`[MIGRATION] Пересоздана предопределенная запись: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId})`);
          }
        } else {
          // Записи нет в DefaultValues — проверяем существование по id
          let recordToRegister;
          
          if (data.id) {
            // Если указан id, проверяем существование записи
            recordToRegister = await Model.findOne({
              where: { id: data.id },
              transaction
            });
          }
          
          if (recordToRegister) {
            // Запись существует — обновляем и регистрируем в DefaultValues
            const updateData = { ...data };
            delete updateData.id;
            
            const hasChanges = Object.keys(updateData).some(key => 
              recordToRegister[key] !== updateData[key]
            );
            
            if (hasChanges) {
              await recordToRegister.update(updateData, { transaction });
            }
            
            // Проверяем, нет ли уже такой записи в DefaultValues
            const existingDefVal = await DefaultValuesModel.findOne({
              where: {
                level: LEVEL,
                defaultValueId: defaultValueId,
                tableName: entity
              },
              transaction
            });
            
            if (!existingDefVal) {
              await DefaultValuesModel.create({
                level: LEVEL,
                defaultValueId: defaultValueId,
                tableName: entity,
                recordId: recordToRegister.id
              }, { transaction });
              console.log(`[MIGRATION] Зарегистрирована существующая запись: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId})`);
            } else {
              console.log(`[MIGRATION] Запись уже зарегистрирована: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId})`);
            }
          } else {
            // Записи нет нигде — создаем новую
            const newRecord = await Model.create(data, { transaction });
            
            // Проверяем, нет ли уже такой записи в DefaultValues
            const existingDefVal = await DefaultValuesModel.findOne({
              where: {
                level: LEVEL,
                defaultValueId: defaultValueId,
                tableName: entity
              },
              transaction
            });
            
            if (!existingDefVal) {
              await DefaultValuesModel.create({
                level: LEVEL,
                defaultValueId: defaultValueId,
                tableName: entity,
                recordId: newRecord.id
              }, { transaction });
              console.log(`[MIGRATION] Добавлена предопределенная запись: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId})`);
            } else {
              console.log(`[MIGRATION] Запись уже зарегистрирована (обновлен recordId): ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId})`);
            }
          }
        }
      }
    }
    
    // Фиксируем транзакцию
    await transaction.commit();
    console.log('[MIGRATION] Миграция базы данных завершена успешно.');
    
  } catch (error) {
    // Откатываем транзакцию при ошибке
    await transaction.rollback();
    console.error('[MIGRATION] ОШИБКА: Миграция отменена, все изменения откатаны.');
    console.error('[MIGRATION] Детали ошибки:', error.message);
    console.error(error.stack);
    throw error;
  }
  
  await sequelize.close();

  // После успешного завершения — запуск инициализации drive_forms/db/createDB.js
  const formsCreateDB = path.resolve(__dirname, '../../drive_forms/db/createDB.js');
  if (fs.existsSync(formsCreateDB)) {
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [formsCreateDB], { stdio: 'inherit' });
    child.on('exit', code => {
      process.exit(code);
    });
  }
}

createAll().catch(e => {
  console.error('Ошибка при создании БД:', e);
  process.exit(1);
});
