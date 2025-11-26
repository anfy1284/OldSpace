/**
 * Вызов серверного метода приложения
 * @param {string} app - имя приложения (например, 'login')
 * @param {string} method - имя метода
 * @param {object} params - параметры (объект)
 * @returns {Promise<object>} - результат вызова
 */
function callServerMethod(app, method, params = {}) {
	return fetch('/app/call', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ app, method, params })
	})
	.then(r => r.json())
	.then(data => {
		if ('error' in data) throw new Error(data.error);
		return data.result;
	});
}
