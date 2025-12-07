// deleteDB.js
// Script to drop PostgreSQL database

const { Client } = require('pg');
const dbSettings = require('./dbSettings.json');

async function dropDatabase() {
  const adminClient = new Client({
    user: dbSettings.username,
    password: dbSettings.password,
    host: dbSettings.host,
    port: dbSettings.port,
    port: dbSettings.port,
    database: 'postgres', // Connect to system database
  });
  await adminClient.connect();
  const dbName = dbSettings.database;
  // Disconnect all users from database
  await adminClient.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
  // Drop database
  await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  console.log(`Database ${dbName} dropped.`);
  await adminClient.end();
}

dropDatabase().catch(e => {
  console.error('Error dropping DB:', e);
  process.exit(1);
});
