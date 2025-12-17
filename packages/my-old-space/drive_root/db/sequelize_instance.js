const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');



// Читаем настройки из dbSettings.json
// 1. Если production и есть DATABASE_URL — используем только её
// 2. Если DB_SETTINGS_PATH задана — используем её
// 3. Иначе ищем dbSettings.json сначала в корне процесса, потом в пакете
let settings;
const tryPaths = [];
if (process.env.DB_SETTINGS_PATH) {
  tryPaths.push(path.resolve(process.env.DB_SETTINGS_PATH));
} else {
  // process.cwd() — корень приложения
  tryPaths.push(path.join(process.cwd(), 'dbSettings.json'));
  tryPaths.push(path.join(__dirname, 'dbSettings.json'));
}
let lastErr;
for (const settingsPath of tryPaths) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    break;
  } catch (e) {
    lastErr = e;
  }
}
if (!settings) {
  console.error('Ошибка чтения dbSettings.json по путям:', tryPaths, lastErr?.message);
  throw lastErr;
}

let sequelize;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Для Supabase часто нужно
      }
    }
  });
} else {
  sequelize = new Sequelize(settings.database, settings.username, settings.password, {
    host: settings.host,
    port: settings.port,
    dialect: settings.dialect,
    logging: false,
    dialectOptions: {
      charset: 'utf8',
    },
  });
}

module.exports = sequelize;
