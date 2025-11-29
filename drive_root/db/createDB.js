
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dbSettings = require('./dbSettings.json');
const modelsDef = require('./db');
const defaultValues = require('./defaultValues');
const { hashPassword } = require('./utilites');

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

  // Drop all tables (child first)
  if (models.UserSystems) await models.UserSystems.drop({ cascade: true }).catch(()=>{});
  if (models.Sessions) await models.Sessions.drop({ cascade: true }).catch(()=>{});
  if (models.Users) await models.Users.drop({ cascade: true }).catch(()=>{});
  // Add more drop order if needed

  await sequelize.sync({ force: true });

  // Наполнение начальными данными
  for (const [entity, records] of Object.entries(defaultValues)) {
    const modelDef = modelsDef.find(m => m.tableName === entity);
    if (!modelDef) continue;
    const Model = models[modelDef.name];
    if (!Model) continue;
    for (const record of records) {
      let data = { ...record };
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
      await Model.create(data);
    }
  }
  console.log('База данных пересоздана и заполнена начальными данными.');
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
