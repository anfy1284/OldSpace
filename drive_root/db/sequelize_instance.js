const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Читаем настройки из dbSettings.json
const settingsPath = path.join(__dirname, 'dbSettings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

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
