const { createServer } = require('./drive_root/server');

const PORT = process.env.PORT || 3000;

const server = createServer();
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

module.exports = server;
