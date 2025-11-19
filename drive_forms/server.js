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

function handleRequest(req, res, appDir, appAlias) {
	try {
		const prefix = `/${appAlias}`;
		let rel = '';

		if (req.url === prefix || req.url === `${prefix}/`) {
			rel = 'index.html';
		} else if (req.url.startsWith(`${prefix}/`)) {
			rel = decodeURIComponent(req.url.slice(prefix.length + 1));
			if (!rel) rel = 'index.html';
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not Found');
			return;
		}

		// Разрешены только файлы из белого списка
		if (!ALLOWED.has(rel)) {
			res.writeHead(403, { 'Content-Type': 'text/plain' });
			res.end('Forbidden');
			return;
		}

		const filePath = safeJoin(appDir, rel);
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

