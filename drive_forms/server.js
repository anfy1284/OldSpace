const fs = require('fs');
const path = require('path');

// Загружаем конфиг приложения (whitelist публичных файлов)
let appConfig = { publicFiles: [] };
try {
	const cfgPath = path.join(__dirname, 'server_config.json');
	appConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
} catch (e) {
	console.error('[drive_forms] Failed to read server_config.json:', e.message);
}

//Загружаем конфиг apps.json
let appsConfig = { apps: [] };
try {
	const appsCfgPath = path.join(__dirname, 'apps.json');
	appsConfig = JSON.parse(fs.readFileSync(appsCfgPath, 'utf8'));
} catch (e) {
	console.error('[drive_forms] Failed to read apps.json:', e.message);
}

const ALLOWED = new Set(appConfig.publicFiles || []);

function getContentType(fileName) {
	const ext = path.extname(fileName).toLowerCase();
	switch (ext) {
		case '.html':
			return 'text/html; charset=utf-8';
		case '.js':
			return 'application/javascript; charset=utf-8';
		case '.css':
			return 'text/css; charset=utf-8';
		case '.json':
			return 'application/json; charset=utf-8';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.svg':
			return 'image/svg+xml';
		default:
			return 'application/octet-stream';
	}
}

function safeJoin(baseDir, relativePath) {
	const norm = path.normalize(relativePath).replace(/^[/\\]+/, '');
	// запретить выход за пределы директории
	if (norm.includes('..')) return null;
	return path.join(baseDir, norm);
}

function loadApp(name) {
	const app = appsConfig.apps.find(a => a.name === name);
	if (app && app.path) {
		return path.join(app.path, 'client.js');
	}
	return null;
}


// Вспомогательная функция для динамического вызова метода приложения
function invokeAppMethod(appName, methodName, params, callback) {
	// Путь к серверному js-файлу приложения
	const appEntry = appsConfig.apps.find(a => a.name === appName);
	if (!appEntry) return callback(new Error('App not found'));
	const appServerPath = path.join(__dirname, '..', 'apps', appName, 'server.js');
	if (!fs.existsSync(appServerPath)) return callback(new Error('App server.js not found'));
	let appModule;
	try {
		// Удаляем из require cache для hot-reload
		delete require.cache[require.resolve(appServerPath)];
		appModule = require(appServerPath);
	} catch (e) {
		return callback(new Error('Failed to load app server.js: ' + e.message));
	}
	if (typeof appModule[methodName] !== 'function') return callback(new Error('Method not found in app'));
	// Вызов функции с распаковкой параметров
	try {
		// params — объект, передаём как аргументы по имени
		// Функция должна принимать один объект (params) или spread
		const result = appModule[methodName](params);
		if (result && typeof result.then === 'function') {
			// async/Promise
			result.then(r => callback(null, r)).catch(e => callback(e));
		} else {
			callback(null, result);
		}
	} catch (e) {
		callback(e);
	}
}

function handleRequest(req, res, appDir, appAlias) {
	try {
		const prefix = `/${appAlias}`;

		// --- Новый endpoint для вызова метода приложения ---
		if (req.method === 'POST' && req.url === `${prefix}/call`) {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				let data;
				try {
					data = JSON.parse(body);
				} catch (e) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid JSON' }));
					return;
				}
				const { app, method, params } = data;
				if (!app || !method) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Missing app or method' }));
					return;
				}
				invokeAppMethod(app, method, params || {}, (err, result) => {
					if (err) {
						res.writeHead(500, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: err.message }));
					} else {
						res.writeHead(200, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ result }));
					}
				});
			});
			return;
		}

		// --- Обычная обработка статики ---
		let rel = '';
		let isAppLoad = false;

		if (req.url === prefix || req.url === `${prefix}/`) {
			rel = 'index.html';
		} else if (req.url.startsWith(`${prefix}/apps/`)) {
			let appName = req.url.slice((`${prefix}/apps/`).length);
			const app = loadApp(appName);
			if (app) {
				rel = app;
				isAppLoad = true;
				appDir = path.join(__dirname, '..', appsConfig.path);
			}
		} else if (req.url.startsWith(`${prefix}/`)) {
			rel = decodeURIComponent(req.url.slice(prefix.length + 1));
			if (!rel) rel = 'index.html';
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not Found');
			return;
		}

		// Разрешены только файлы из белого списка
		if (!ALLOWED.has(rel) && !isAppLoad) {
			res.writeHead(403, { 'Content-Type': 'text/plain' });
			res.end('Forbidden');
			return;
		}

		let filePath = safeJoin(appDir, rel);
        
		if (!filePath) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad request');
			return;
		}

		fs.readFile(filePath, (err, data) => {
			if (err) {
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
				return;
			}

			const headers = {
				'Content-Type': getContentType(rel),
				'Content-Security-Policy': "default-src 'self'",
			};
			res.writeHead(200, headers);
			res.end(data);
		});
	} catch (e) {
		console.error('[drive_forms] handleRequest error:', e);
		res.writeHead(500, { 'Content-Type': 'text/plain' });
		res.end('Internal Server Error');
	}
}

module.exports = { handleRequest };

