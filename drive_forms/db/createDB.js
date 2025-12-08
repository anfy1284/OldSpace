// createDB.js for drive_forms
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const dbSettings = require('../../drive_root/db/dbSettings.json');
const modelsDef = require('./db');
const rootModelsDef = require('../../drive_root/db/db');
const { DEFAULT_VALUES_TABLE } = require('../../drive_root/db/db');
const { processDefaultValues } = require('../../drive_root/globalServerContext');
const { compareSchemas, syncUniqueConstraints } = require('../../drive_root/db/migrationUtils');

// Load configuration and data
const formsConfig = require('../server_config.json');
const LEVEL = formsConfig.level;
const defaultValuesData = require('./defaultValues.json');
const defaultValues = processDefaultValues(defaultValuesData, LEVEL);

function getSequelizeInstance() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    });
  }
  return new Sequelize(dbSettings.database, dbSettings.username, dbSettings.password, {
    host: dbSettings.host,
    port: dbSettings.port,
    dialect: dbSettings.dialect,
    logging: false,
  });
}

async function createAll() {
  const sequelize = getSequelizeInstance();

  // Collect all models: root + local + from apps
  const models = {};
  let allModelsDef = [...rootModelsDef, ...modelsDef];

  // Get list of apps
  const appsJsonPath = path.resolve(__dirname, '../apps.json');
  let appsList = [];
  try {
    const appsJson = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
    appsList = appsJson.apps || [];
  } catch (e) {
    console.error('Error reading apps.json:', e);
  }

  // Find db/db.js for each app
  for (const app of appsList) {
    const dbPath = path.resolve(__dirname, `../../apps${app.path}/db/db.js`);
    if (fs.existsSync(dbPath)) {
      try {
        const appModels = require(dbPath);
        if (Array.isArray(appModels)) {
          allModelsDef = allModelsDef.concat(appModels);
          console.log(`Models from ${dbPath} added.`);
        }
      } catch (e) {
        console.error(`Error requiring ${dbPath}:`, e);
      }
    }
  }

  // Create all models
  for (const def of allModelsDef) {
    const fields = {};
    for (const [field, opts] of Object.entries(def.fields)) {
      const type = Sequelize.DataTypes[opts.type];
      fields[field] = { ...opts, type };
    }
    models[def.name] = sequelize.define(def.name, fields, { ...def.options, tableName: def.tableName });
  }

  // Start transaction for all migration operations
  const transaction = await sequelize.transaction();

  try {
    console.log('[MIGRATION] Starting database schema check (drive_forms)...');

    // Check schema for each model (drive_forms local models + app models)
    const modelsToMigrate = [...modelsDef];

    // Add models from apps
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
      console.log(`[MIGRATION] Checking table: ${tableName}`);

      const tableExists = await sequelize.getQueryInterface().describeTable(tableName, { transaction }).catch(() => null);

      if (!tableExists) {
        console.log(`[MIGRATION] Table ${tableName} does not exist, creating...`);
        await models[def.name].sync({ transaction });
        console.log(`[MIGRATION] Table ${tableName} created.`);
        continue;
      }

      const currentSchema = tableExists;
      const desiredSchema = def.fields;

      const cmp = await compareSchemas(currentSchema, desiredSchema);
      let needsMigration = cmp.needsMigration;
      const differences = cmp.differences;

      // If migration not needed - sync unique constraints and continue
      if (!needsMigration) {
        console.log(`[MIGRATION] Table ${tableName} matches schema, no changes needed.`);
        await syncUniqueConstraints(sequelize, transaction, tableName, desiredSchema);
        continue;
      }

      console.log(`[MIGRATION] Table ${tableName} needs migration:`);
      differences.forEach(diff => console.log(`  ${diff}`));

      const tempTableName = `${tableName}_temp_backup`;
      console.log(`[MIGRATION] Creating temp table: ${tempTableName}`);

      await sequelize.query(
        `CREATE TABLE "${tempTableName}" AS SELECT * FROM "${tableName}"`,
        { transaction }
      );
      console.log(`[MIGRATION] Data copied to temp table.`);

      await sequelize.query(`DROP TABLE "${tableName}" CASCADE`, { transaction });
      console.log(`[MIGRATION] Old table dropped.`);

      await models[def.name].sync({ transaction });
      console.log(`[MIGRATION] New table created with updated schema.`);
      await syncUniqueConstraints(sequelize, transaction, tableName, desiredSchema);

      const commonFields = Object.keys(desiredSchema).filter(field => currentSchema[field]);

      if (commonFields.length > 0) {
        // Copy data row by row via Sequelize to auto-fill timestamps
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
            console.log(`[MIGRATION] Failed to copy row: ${rowErr.message}`);
          }
        }
        console.log(`[MIGRATION] Data copied back (${rows.length} rows, ${commonFields.length} fields).`);
      }

      await sequelize.query(`DROP TABLE "${tempTableName}"`, { transaction });
      console.log(`[MIGRATION] Temp table dropped.`);

      // Reset sequence for autoIncrement after restoring data
      const pkField = Object.keys(desiredSchema).find(key => desiredSchema[key].primaryKey && desiredSchema[key].autoIncrement);
      if (pkField) {
        await sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"${tableName}"', '${pkField}'), COALESCE(MAX("${pkField}"), 1)) FROM "${tableName}"`,
          { transaction }
        );
        console.log(`[MIGRATION] Sequence for ${tableName}.${pkField} reset.`);
      }

      console.log(`[MIGRATION] Migration of table ${tableName} completed successfully.`);
    }

    // Default values management
    console.log('[MIGRATION] Processing default values (drive_forms)...');
    const DefaultValuesModel = models.DefaultValues;

    // Collect systems and access_roles from apps
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
        console.error(`Error reading ${configPath}:`, e);
      }
    }

    // Formulate default form data (base + dynamic)
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

    // Collect default data from apps for separate levels (level = app.name)
    const levelsDefaultValues = { [LEVEL]: formsAll };
    for (const app of appsList) {
      const appDefPath = path.resolve(__dirname, `../../apps${app.path}/db/defaultValues.json`);
      if (fs.existsSync(appDefPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(appDefPath, 'utf8'));
          levelsDefaultValues[app.name] = processDefaultValues(raw, app.name);
        } catch (e) {
          console.error(`Error reading defaultValues for app ${app.name}:`, e.message);
        }
      }
    }

    // Default values management for each level
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
            console.log(`[MIGRATION] Removed obsolete record: ${defVal.tableName}[${defVal.recordId}] (defaultValueId=${defVal.defaultValueId}, level=${lvlName})`);
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
                console.log(`[MIGRATION] Updated default record: ${entity}[${existingRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              } else {
                console.log(`[MIGRATION] Default record is up to date: ${entity}[${existingRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              }
            } else {
              const newRecord = await Model.create(data, { transaction });
              await defEntry.update({ recordId: newRecord.id }, { transaction });
              console.log(`[MIGRATION] Recreated default record: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
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
                console.log(`[MIGRATION] Registered existing record: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              } else {
                console.log(`[MIGRATION] Record already registered: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              }
            } else {
              const newRecord = await Model.create(data, { transaction });
              const existingDefVal = await DefaultValuesModel.findOne({ where: { level: lvlName, defaultValueId, tableName: entity }, transaction });
              if (!existingDefVal) {
                await DefaultValuesModel.create({ level: lvlName, defaultValueId, tableName: entity, recordId: newRecord.id }, { transaction });
                console.log(`[MIGRATION] Added default record: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              } else {
                console.log(`[MIGRATION] Record already registered (updated recordId): ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId}, level=${lvlName})`);
              }
            }
          }
        }
      }
    }

    // After adding/updating default data, reset sequence for all auto-increment PKs
    for (const def of allModelsDef) {
      const pkField = Object.keys(def.fields).find(key => def.fields[key].primaryKey && def.fields[key].autoIncrement);
      if (!pkField) continue;
      const tableName = def.tableName;
      try {
        await sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"${tableName}"', '${pkField}'), COALESCE(MAX("${pkField}"), 1)) FROM "${tableName}"`,
          { transaction }
        );
        // console.log(`[MIGRATION] Sequence updated after default data: ${tableName}.${pkField}`);
      } catch (e) {
        console.error(`[MIGRATION] Error resetting sequence for ${tableName}.${pkField}:`, e.message);
      }
    }

    await transaction.commit();
    console.log('[MIGRATION] Database migration (drive_forms) completed successfully.');

  } catch (error) {
    await transaction.rollback();
    console.error('[MIGRATION] ERROR: Migration cancelled, all changes rolled back.');
    console.error('[MIGRATION] Error details:', error.message);
    console.error(error.stack);
    throw error;
  }

  await sequelize.close();
  console.log('drive_forms tables updated.');
}

if (require.main === module) {
  createAll().catch(e => {
    console.error('Error creating DB (drive_forms):', e);
    process.exit(1);
  });
}
