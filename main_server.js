// Root shim so environments expecting /workspace/main_server.js work.
// Delegates to the existing implementation inside packages/my-old-space.
const path = require('path');

// Ensure PROJECT_ROOT is set for child scripts that rely on it
process.env.PROJECT_ROOT = process.env.PROJECT_ROOT || __dirname;

const target = path.join(__dirname, 'packages', 'my-old-space', 'main_server.js');
try {
  require(target);
} catch (err) {
  console.error(`[root main_server] Failed to require ${target}:`, err && err.stack || err);
  process.exit(1);
}
