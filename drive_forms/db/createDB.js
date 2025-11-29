// createDB.js для drive_forms
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const dbSettings = require('../../drive_root/db/dbSettings.json');
const modelsDef = require('./db');
const defaultValues = require('./defaultValues');

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
  const models = {};
  // Собираем все модели: локальные + из приложений
  let allModelsDef = [...modelsDef];

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

  // Удаляем все таблицы перед созданием (drop all)
  await sequelize.drop();
  await sequelize.sync({ force: true });

  // systems
  const systemSet = new Set();
  // access_roles
  const accessSet = new Set();
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
  const uniqueSystems = Array.from(systemSet);
  const uniqueAccessRoles = Array.from(accessSet);

  if (uniqueSystems.length > 0 && models.Systems) {
    for (const sysName of uniqueSystems) {
      await models.Systems.create({ name: sysName });
    }
  }
  if (uniqueAccessRoles.length > 0 && models.AccessRoles) {
    for (const roleName of uniqueAccessRoles) {
      await models.AccessRoles.create({ name: roleName });
    }
  }

  await sequelize.close();
  console.log('Таблицы drive_forms созданы и заполнены.');
}

if (require.main === module) {
  createAll().catch(e => {
    console.error('Ошибка при создании БД (drive_forms):', e);
    process.exit(1);
  });
}
