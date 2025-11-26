const http = require('http');
const fs = require('fs');
const path = require('path');
const qs = require('querystring');

// Сессии и клиенты теперь через sessionManager
const { getOrCreateSession } = require('./db/sessionManager');
let clients = {};
// Настройки приложения (директория и псевдоним берутся из конфигурации)
let config;
let appAlias;
let appDir;
let appHandler;
try {
    config = require(path.join(__dirname, '..', 'server.config.json'));
    appAlias = config.appAlias;
    appDir = path.join(__dirname, '..', config.appDir);
    appHandler = require(path.join(appDir, config.appHandler));
} catch (e) {
    console.error('ERROR loading configuration or application handler:', e.message);
    console.error('Expected server.config.json like:');
    console.error(JSON.stringify({ appDir: 'drive_forms', appAlias: 'app', appIndexPage: 'index.html', appHandler: 'server.js' }, null, 2));
    process.exit(1);
}

function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function generateClientId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveSessionId(sessionId) {
    // В будущем здесь будет сохранение в БД
    sessions[sessionId] = {
        id: sessionId,
        created: new Date()
    };
}

function saveClientId(clientId) {
    // В будущем здесь будет сохранение в БД
    clients[clientId] = {
        id: clientId,
        created: new Date()
    };
}

function handleApiRequest(req, res) {
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            let response = {};
            
            switch (data.method) {
                case 'get_session_id':
                    const sessionId = generateSessionId();
                    saveSessionId(sessionId);
                    response = { sessionId: sessionId };
                    break;
                
                case 'get_client_id':
                    const clientId = generateClientId();
                    saveClientId(clientId);
                    response = { clientId: clientId };
                    break;
                
                default:
                    response = { error: 'Unknown method' };
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad request' }));
        }
    });
}

function createServer() {
    const server = http.createServer(async (req, res) => {
        // Получаем или создаём сессию для каждого запроса
        await getOrCreateSession(req, res);
        if (req.url === '/api' && req.method === 'POST') {
            handleApiRequest(req, res);
        } else {
            if (req.url === '/') {
                // По умолчанию отдаём страницу приложения
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
                // Обрабатываем запросы к прикладному приложению
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
            } 
            else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            }
        }
    });
    return server;
}

module.exports = { createServer };
