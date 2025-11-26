// deleteDB.js
// Скрипт для удаления базы данных PostgreSQL

const { Client } = require('pg');
const dbSettings = require('./dbSettings.json');

async function dropDatabase() {
  const adminClient = new Client({
    user: dbSettings.username,
    password: dbSettings.password,
    host: dbSettings.host,
    port: dbSettings.port,
    database: 'postgres', // Подключаемся к системной базе
  });
  await adminClient.connect();
  const dbName = dbSettings.database;
  // Отключаем всех пользователей от базы
  await adminClient.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
  // Удаляем базу
  await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  console.log(`База данных ${dbName} удалена.`);
  await adminClient.end();
}

dropDatabase().catch(e => {
  console.error('Ошибка при удалении БД:', e);
  process.exit(1);
});
