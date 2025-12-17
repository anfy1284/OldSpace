const { start } = require('my-old-space');
const path = require('path');
const config = require('./server.config.json');

start({
  rootPath: __dirname,
  config
});
