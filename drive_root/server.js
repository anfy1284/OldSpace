// Get getContentType from global context
const { getContentType } = require('./globalServerContext');
const http = require('http');
const fs = require('fs');
const path = require('path');
const qs = require('querystring');

// Sessions and clients are now handled via sessionManager
const { getOrCreateSession } = require('./db/sessionManager');

// Universal function to find and run init.js
function runInitIfExists(dir) {
    const initPath = path.join(dir, 'init.js');
    if (fs.existsSync(initPath)) {
        try {
            require(initPath);
        } catch (e) {
            console.error(`[init] Error running ${initPath}:`, e);
        }
    }
}

// App settings (directory and alias taken from config)

let config;
let appAlias;
let appDir;
let appHandler;
try {
    // 1. Initialize base level
    runInitIfExists(path.join(__dirname));

    config = require(path.join(__dirname, '..', 'server.config.json'));
    appAlias = config.appAlias;
    appDir = path.join(__dirname, '..', config.appDir);

    // 2. Initialize application level
    runInitIfExists(appDir);

    appHandler = require(path.join(appDir, config.appHandler));

    // 3. Initialize all applications from apps.json (if present)
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

// Check access to protected resources (stub)
function checkProtectedAccess(sessionId, filePath) {
    // TODO: Implement real access check by sessionId and filePath
    return false;
}

async function handleRequest(req, res) {
    console.log('[drive_root] Request:', req.method, req.url);
    await getOrCreateSession(req, res);

    // Handle favicon
    if (req.url === '/favicon.ico' || req.url === '/favicon.svg') {
        const faviconPath = path.join(__dirname, 'resources', 'public', 'favicon.svg');
        if (fs.existsSync(faviconPath)) {
            fs.readFile(faviconPath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
                res.end(data);
            });
        } else {
            res.writeHead(204);
            res.end();
        }
        return;
    }

    // Universal resource serving: /res/public/..., /res/protected/...
    if (req.url.startsWith('/res/')) {
        const urlPath = req.url.split('?')[0];
        const parts = urlPath.split('/').filter(Boolean); // ['', 'res', 'public', ...] => ['res', 'public', ...]
        if (parts.length >= 3) {
            const resType = parts[1]; // public or protected
            const relPath = parts.slice(2).join(path.sep);
            let filePath;
            if (resType === 'public') {
                filePath = path.join(__dirname, 'resources', 'public', relPath);
                if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }
                // Serve file without check
                const contentType = getContentType(filePath);
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Error reading file');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                });
                return;
            } else if (resType === 'protected') {
                filePath = path.join(__dirname, 'resources', 'protected', relPath);
                if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }
                // Check access by sessionId (from cookie)
                let sessionId = null;
                if (req.headers && req.headers.cookie) {
                    const match = req.headers.cookie.match(/(?:^|; )sessionId=([^;]+)/i);
                    if (match) sessionId = decodeURIComponent(match[1]);
                }
                if (!checkProtectedAccess(sessionId, filePath)) {
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('Forbidden');
                    return;
                }
                // Serve file
                const contentType = getContentType(filePath);
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Error reading file');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                });
                return;
            }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
    }

    // Handle app static files: /apps/<appName>/resources/<type>/...
    if (req.url.startsWith('/apps/')) {
        const urlPath = req.url.split('?')[0];
        const parts = urlPath.split('/').filter(Boolean); // ['', 'apps', 'appName', 'resources', 'type', ...] => ['apps', 'appName', 'resources', 'type', ...]
        // parts[0] = 'apps'
        // parts[1] = appName
        // parts[2] = 'resources'
        // parts[3] = type (public/protected)
        if (parts.length >= 5 && parts[2] === 'resources') {
            const appName = parts[1];
            const resType = parts[3];
            const relPath = parts.slice(4).join(path.sep);

            // Path to apps folder relative to drive_root
            const appsDir = path.join(__dirname, '..', 'apps');

            if (resType === 'public') {
                const filePath = path.join(appsDir, appName, 'resources', 'public', relPath);

                if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }

                const contentType = getContentType(filePath);
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Error reading file');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                });
                return;
            }
            // TODO: protected resources for apps
        }
    }

    // ...remaining logic...
    if (req.url === '/') {
        fs.readFile(path.join(appDir, config.appIndexPage), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Security-Policy': "default-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
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
        handleRequest(req, res).catch(e => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error', details: e.message }));
        });
    });
    return server;
}

module.exports = { createServer };
