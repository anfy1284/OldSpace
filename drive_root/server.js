const http = require('http');
const fs = require('fs');
const path = require('path');
const qs = require('querystring');

// Сессии и клиенты теперь через sessionManager
const { getOrCreateSession } = require('./db/sessionManager');

// Универсальная функция для поиска и запуска init.js
function runInitIfExists(dir) {
    const initPath = path.join(dir, 'init.js');
    if (fs.existsSync(initPath)) {
        try {
            require(initPath);
        } catch (e) {
            console.error(`[init] Ошибка запуска ${initPath}:`, e);
        }
    }
}
// ...existing code...
// Настройки приложения (директория и псевдоним берутся из конфигурации)

let config;
let appAlias;
let appDir;
let appHandler;
try {
    // 1. Инициализация базового уровня
    runInitIfExists(path.join(__dirname));

    config = require(path.join(__dirname, '..', 'server.config.json'));
    appAlias = config.appAlias;
    appDir = path.join(__dirname, '..', config.appDir);

    // 2. Инициализация прикладного уровня
    runInitIfExists(appDir);

    appHandler = require(path.join(appDir, config.appHandler));

    // 3. Инициализация всех приложений из apps.json (если есть)
    const appsJsonPath = path.join(appDir, 'apps.json');
    if (fs.existsSync(appsJsonPath)) {
        const appsConfig = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
        const appsBaseDir = path.join(__dirname, '..', 'apps');
        if (Array.isArray(appsConfig.apps)) {
            for (const app of appsConfig.apps) {
                if (app.name) {
                    runInitIfExists(path.join(appsBaseDir, app.name));
                }
            }
        }
    }
} catch (e) {
    console.error('ERROR loading configuration or application handler:', e.message);
    console.error('Expected server.config.json like:');
    console.error(JSON.stringify({ appDir: 'drive_forms', appAlias: 'app', appIndexPage: 'index.html', appHandler: 'server.js' }, null, 2));
    process.exit(1);
}

async function handleApiRequest(req, res) {
    await getOrCreateSession(req, res);
    if (req.url === '/') {
        fs.readFile(path.join(appDir, config.appIndexPage), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Security-Policy': "default-src 'self'"
            });
            res.end(data);
        });
    } else if (req.url === '/client.js') {
        fs.readFile(path.join(__dirname, 'client.js'), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Content-Security-Policy': "default-src 'self'"
            });
            res.end(data);
        });
    } else if (req.url.startsWith(`/${appAlias}`)) {
        try {
            if (typeof appHandler.handleRequest === 'function') {
                appHandler.handleRequest(req, res, appDir, appAlias);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                console.error('Error: appHandler.handleRequest is not a function');
                console.error('Please ensure your application handler exports a handleRequest function');
                res.end('Application handler not configured properly. Check server logs for details.');
            }
        } catch (err) {
            console.error('Error loading application handler:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Application handler error');
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
}

function createServer() {
    const server = http.createServer((req, res) => {
        handleApiRequest(req, res).catch(e => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error', details: e.message }));
        });
    });
    return server;
}

module.exports = { createServer };
