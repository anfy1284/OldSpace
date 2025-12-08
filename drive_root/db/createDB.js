
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dbSettings = require('./dbSettings.json');
const modelsDef = require('./db');
const { DEFAULT_VALUES_TABLE } = require('./db');
const { hashPassword } = require('./utilites');
const { processDefaultValues } = require('../globalServerContext');
const { normalizeType, compareSchemas, syncUniqueConstraints } = require('./migrationUtils');

// Load config and data
const rootConfig = require('../../server.config.json');
const LEVEL = rootConfig.level;
const defaultValuesData = require('./defaultValues.json');
const defaultValues = processDefaultValues(defaultValuesData, LEVEL);

async function ensureDatabase() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL in production, skipping database creation check.');
    return;
  }

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
    await adminClient.query(`CREATE DATABASE "${dbName}" WITH ENCODING 'UTF8' LC_COLLATE='C.UTF-8' LC_CTYPE='C.UTF-8'`);
    console.log(`Database ${dbName} created.`);
  } else {
    console.log(`Database ${dbName} already exists.`);
  }
  await adminClient.end();
}

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
  await ensureDatabase();
  const sequelize = getSequelizeInstance();
  const appsDir = path.resolve(__dirname, '../../apps');
  const appModelDefs = [];
  if (fs.existsSync(appsDir)) {
    const entries = fs.readdirSync(appsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const entry of entries) {
      const dbPath = path.join(appsDir, entry.name, 'db', 'db.js');
      if (!fs.existsSync(dbPath)) continue;
      try {
        const mod = require(dbPath);
        const defs = Array.isArray(mod)
          ? mod
          : Array.isArray(mod && mod.models)
            ? mod.models
            : null;
        if (Array.isArray(defs) && defs.length) {
          appModelDefs.push(...defs);
          console.log(`[MIGRATION] Added models for app ${entry.name} (${defs.length})`);
        }
      } catch (err) {
        console.error(`[MIGRATION] Failed to load models for app ${entry.name}:`, err.message);
      }
    }
  }
  const allModelsDef = [...modelsDef, ...appModelDefs];

  // Generate models
  const models = {};
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
    console.log('[MIGRATION] Starting database schema check...');

    // Check schema for each model
    for (const def of allModelsDef) {
      const tableName = def.tableName;
      console.log(`[MIGRATION] Checking table: ${tableName}`);

      // Get table description from DB
      const tableExists = await sequelize.getQueryInterface().describeTable(tableName, { transaction }).catch(() => null);

      if (!tableExists) {
        console.log(`[MIGRATION] Table ${tableName} does not exist, creating...`);
        await models[def.name].sync({ transaction });
        console.log(`[MIGRATION] Table ${tableName} created.`);
        continue;
      }

      // Compare schemas
      const currentSchema = tableExists;
      const desiredSchema = def.fields;

      const cmp = await compareSchemas(currentSchema, desiredSchema);
      let needsMigration = cmp.needsMigration;
      const differences = cmp.differences;

      if (!needsMigration) {
        console.log(`[MIGRATION] Table ${tableName} matches schema, no changes needed.`);
        // Sync unique constraints if present in DB but removed from model
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

      // Remove obsolete unique constraints after recreation
      await syncUniqueConstraints(sequelize, transaction, tableName, desiredSchema);

      // Copy data back (only matching fields)
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

      // Drop temp table
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
    console.log('[MIGRATION] Processing default values...');
    const DefaultValuesModel = models.DefaultValues;

    // Collect all defaultValueId for current level from defaultValues
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

    // Remove records not present in current level
    const existingDefaults = await DefaultValuesModel.findAll({
      where: { level: LEVEL },
      transaction
    });

    for (const defValue of existingDefaults) {
      if (!currentLevelIds.has(defValue.defaultValueId)) {
        // Remove record from main table
        const modelDef = modelsDef.find(m => m.tableName === defValue.tableName);
        if (modelDef && models[modelDef.name]) {
          await models[modelDef.name].destroy({
            where: { id: defValue.recordId },
            transaction
          });
          console.log(`[MIGRATION] Removed obsolete record: ${defValue.tableName}[${defValue.recordId}] (defaultValueId=${defValue.defaultValueId})`);
        }
        // Remove record from DEFAULT_VALUES_TABLE
        await defValue.destroy({ transaction });
      }
    }

    // Add or update default values
    for (const [entity, records] of Object.entries(defaultValues)) {
      const modelDef = modelsDef.find(m => m.tableName === entity);
      if (!modelDef) continue;
      const Model = models[modelDef.name];
      if (!Model) continue;

      for (const record of records) {
        const defaultValueId = record.id;
        if (defaultValueId === undefined) continue;

        let data = { ...record };
        delete data._level; // Remove service field

        // Specific handling for users
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

        // Look up record in DEFAULT_VALUES_TABLE
        const defaultValueEntry = await DefaultValuesModel.findOne({
          where: {
            level: LEVEL,
            defaultValueId: defaultValueId,
            tableName: entity
          },
          transaction
        });

        if (defaultValueEntry) {
          // Record exists in DefaultValues - update data
          const existingRecord = await Model.findOne({
            where: { id: defaultValueEntry.recordId },
            transaction
          });

          if (existingRecord) {
            await existingRecord.update(data, { transaction });
            console.log(`[MIGRATION] Updated default record: ${entity}[${existingRecord.id}] (defaultValueId=${defaultValueId})`);
          } else {
            // Record missing in main table - recreate
            const newRecord = await Model.create(data, { transaction });
            await defaultValueEntry.update({ recordId: newRecord.id }, { transaction });
            console.log(`[MIGRATION] Recreated default record: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId})`);
          }
        } else {
          // Record not in DefaultValues - check existence by id
          let recordToRegister;

          if (data.id) {
            // If id is specified, check if record exists
            recordToRegister = await Model.findOne({
              where: { id: data.id },
              transaction
            });
          }

          if (recordToRegister) {
            // Record exists - update and register in DefaultValues
            const updateData = { ...data };
            delete updateData.id;

            const hasChanges = Object.keys(updateData).some(key =>
              recordToRegister[key] !== updateData[key]
            );

            if (hasChanges) {
              await recordToRegister.update(updateData, { transaction });
            }

            // Check if already registered in DefaultValues
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
              console.log(`[MIGRATION] Registered existing record: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId})`);
            } else {
              console.log(`[MIGRATION] Record already registered: ${entity}[${recordToRegister.id}] (defaultValueId=${defaultValueId})`);
            }
          } else {
            // Record doesn't exist anywhere - create new
            const newRecord = await Model.create(data, { transaction });

            // Check if already registered in DefaultValues
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
              console.log(`[MIGRATION] Added default record: ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId})`);
            } else {
              console.log(`[MIGRATION] Record already registered (updated recordId): ${entity}[${newRecord.id}] (defaultValueId=${defaultValueId})`);
            }
          }
        }
      }
    }

    // Commit transaction
    await transaction.commit();
    console.log('[MIGRATION] Database migration completed successfully.');

  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    console.error('[MIGRATION] ERROR: Migration cancelled, all changes rolled back.');
    console.error('[MIGRATION] Error details:', error.message);
    console.error(error.stack);
    throw error;
  }

  await sequelize.close();

  // After successful completion - run drive_forms/db/createDB.js
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
  console.error('Error creating database:', e);
  process.exit(1);
});
