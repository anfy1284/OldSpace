// Используем функцию getContentType из глобального контекста через globalRoot
const formsGlobal = require('./globalServerContext');
const globalRoot = require('../drive_root/globalServerContext');
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


function safeJoin(baseDir, relativePath) {
	const norm = path.normalize(relativePath).replace(/^[/\\]+/, '');
	// запретить выход за пределы директории
	if (norm.includes('..')) return null;
	return path.join(baseDir, norm);
}

function loadApp(name) {
	const app = appsConfig.apps.find(a => a.name === name);
	if (app && app.path) {
		return path.join(app.path, 'resources', 'public', 'client.js');
	}
	return null;
}


// Вспомогательная функция для динамического вызова метода приложения
// Вспомогательная функция для динамического вызова метода приложения
function invokeAppMethod(appName, methodName, params, sessionID, callback) {
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
	// Вызов функции с sessionID отдельным параметром
	try {
		// params — объект, sessionID — строка
		const result = appModule[methodName](params, sessionID);
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
	// Обработка ресурсов и API-эндпоинтов
	try {
		// Универсальная отдача ресурсов: /<appAlias>/res/public/..., /<appAlias>/res/protected/...
		if (req.url.startsWith(`/${appAlias}/res/`)) {
			const parts = req.url.split('/').filter(Boolean); // ['', appAlias, 'res', 'public', ...] => ['appAlias', 'res', 'public', ...]
			if (parts.length >= 4) {
				const resType = parts[2]; // public или protected
				const relPath = parts.slice(3).join(path.sep);
				let filePath;
				if (resType === 'public') {
					filePath = path.join(__dirname, 'resources', 'public', relPath);
					if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
						res.writeHead(404, { 'Content-Type': 'text/plain' });
						res.end('404 Not Found');
						return;
					}
					const contentType = globalRoot.getContentType(filePath);
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
					// Проверка доступа по sessionID (заглушка)
					let sessionID = null;
					if (req.headers && req.headers.cookie) {
						const match = req.headers.cookie.match(/(?:^|; )sessionID=([^;]+)/);
						if (match) sessionID = decodeURIComponent(match[1]);
					}
					// TODO: реализовать реальную проверку доступа
					// Сейчас доступ всегда запрещён
					const checkProtectedAccess = (sessionId, filePath) => false;
					if (!checkProtectedAccess(sessionID, filePath)) {
						res.writeHead(403, { 'Content-Type': 'text/plain' });
						res.end('Forbidden');
						return;
					}
					const contentType = globalRoot.getContentType(filePath);
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
		// --- Endpoint для получения клиентских скриптов доступных приложений ---
		if ((req.method === 'POST' || req.method === 'GET') && req.url === `/${appAlias}/loadApps`) {
			// Получаем пользователя по sessionID
			let sessionID = null;
			if (req.headers && req.headers.cookie) {
				const match = req.headers.cookie.match(/(?:^|; )sessionID=([^;]+)/);
				if (match) sessionID = decodeURIComponent(match[1]);
			}
			globalRoot.getUserBySessionID(sessionID).then(user => {
				return formsGlobal.loadApps(user);
			}).then(result => {
				if (req.method === 'GET') {
					res.writeHead(200, { 'Content-Type': 'application/javascript' });
					res.end(result);
				} else {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ result }));
				}
			}).catch(e => {
				res.writeHead(500, { 'Content-Type': req.method === 'GET' ? 'text/javascript' : 'application/json' });
				res.end(req.method === 'GET' ? ('/* error: ' + e.message.replace(/\*\//g, '') + ' */') : JSON.stringify({ error: e.message }));
			});
			return;
		}

		// --- Новый endpoint для вызова метода приложения ---
		if (req.method === 'POST' && req.url === `/${appAlias}/call`) {
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
				// Извлекаем sessionID из cookie
				let sessionID = null;
				if (req.headers && req.headers.cookie) {
					const match = req.headers.cookie.match(/(?:^|; )sessionID=([^;]+)/);
					if (match) sessionID = decodeURIComponent(match[1]);
				}
				invokeAppMethod(app, method, params || {}, sessionID, (err, result) => {
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

		// Всё остальное — 404
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not Found');
	} catch (e) {
		console.error('[drive_forms] handleRequest error:', e);
		res.writeHead(500, { 'Content-Type': 'text/plain' });
		res.end('Internal Server Error');
	}
}

module.exports = { handleRequest };

