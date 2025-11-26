// createDB.js
// Универсальный скрипт для создания структуры БД и наполнения начальными данными


const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dbSettings = require('./dbSettings.json');
const modelsDef = require('./db');
const defaultValues = require('./defaultValues');
const { hashPassword } = require('./utilites');

// Функция для проверки и создания базы
async function ensureDatabase() {
  // Подключаемся к postgres (или другой существующей БД)
  const adminClient = new Client({
    user: dbSettings.username,
    password: dbSettings.password,
    host: dbSettings.host,
    port: dbSettings.port,
    database: 'postgres',
  });
  await adminClient.connect();
  // Проверяем наличие базы
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

// Динамически создаём модели на основе структуры из db.js
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
  const models = {};
  // modelsDef теперь массив моделей
  for (const def of modelsDef) {
    const fields = {};
    for (const [field, opts] of Object.entries(def.fields)) {
      const type = Sequelize.DataTypes[opts.type];
      fields[field] = { ...opts, type };
    }
    models[def.name] = sequelize.define(def.name, fields, { ...def.options, tableName: def.tableName });
  }

  // Удаляем все таблицы перед созданием (drop all)
  await sequelize.drop();
  await sequelize.sync({ force: true });

  // Универсально добавляем данные из defaultValues, не удаляя существующие
  for (const [entity, records] of Object.entries(defaultValues)) {
    // ищем модель по tableName
    const modelDef = modelsDef.find(m => m.tableName === entity);
    if (!modelDef) continue;
    const Model = models[modelDef.name];
    if (!Model) continue;
    for (const record of records) {
      let data = { ...record };
      // Согласуем поля для users
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
}

createAll().catch(e => {
  console.error('Ошибка при создании БД:', e);
  process.exit(1);
});
