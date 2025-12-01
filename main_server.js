// ВАЖНО: require('./drive_root/server') выполняем после миграций БД,
// чтобы init приложений не запускался до создания таблиц и загрузки сидов
const path = require('path');
const { spawn } = require('child_process');
const globalContext = require('./drive_root/globalServerContext');

const PORT = process.env.PORT || 3000;

// Запускаем createDB.js перед стартом сервера
const createDBPath = path.join(__dirname, 'drive_root', 'db', 'createDB.js');
console.log('Инициализация базы данных...');

const dbProcess = spawn(process.execPath, [createDBPath], { stdio: 'inherit' });

dbProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Ошибка инициализации БД (код выхода: ${code})`);
    process.exit(1);
  }
  
  console.log('База данных инициализирована.');
  
  // Загружаем кеш предопределённых значений перед стартом сервера
  Promise.resolve(globalContext.reloadDefaultValues())
    .then(() => {
      const { createServer } = require('./drive_root/server');
      const server = createServer();
      server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('Ошибка загрузки defaultValuesCache:', err && err.message || err);
      const { createServer } = require('./drive_root/server');
      const server = createServer();
      server.listen(PORT, () => {
        console.log(`Сервер запущен на http://localhost:${PORT} (без кеша предопределённых значений)`);
      });
    });
  
});

module.exports = { server: null };
