// IMPORTANT: require('./drive_root/server') must be executed after DB migrations,
// to ensure app init doesn't run before tables are created and seeds are loaded.
const path = require('path');
const { spawn } = require('child_process');
const globalContext = require('./drive_root/globalServerContext');

const PORT = process.env.PORT || 3000;

// Run createDB.js before starting the server
const createDBPath = path.join(__dirname, 'drive_root', 'db', 'createDB.js');
console.log('Initializing database...');

const dbProcess = spawn(process.execPath, [createDBPath], { stdio: 'inherit' });

dbProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`DB initialization error (exit code: ${code})`);
    process.exit(1);
  }

  console.log('Database initialized.');

  // Load default values cache before starting the server
  Promise.resolve(globalContext.reloadDefaultValues())
    .then(() => {
      const { createServer } = require('./drive_root/server');
      const server = createServer();
      server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('Error loading defaultValuesCache:', err && err.message || err);
      const { createServer } = require('./drive_root/server');
      const server = createServer();
      server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT} (without default values cache)`);
      });
    });
});

module.exports = { server: null };
