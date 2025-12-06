const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Читаем настройки из dbSettings.json
const settingsPath = path.join(__dirname, 'dbSettings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

const sequelize = new Sequelize(settings.database, settings.username, settings.password, {
  host: settings.host,
  port: settings.port,
  dialect: settings.dialect,
  logging: false,
  dialectOptions: {
    charset: 'utf8',
  },
});

module.exports = sequelize;
