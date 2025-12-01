// Глобальный серверный контекст
const global = require('../../drive_root/globalServerContext');
const formsGlobal = require('../../drive_forms/globalServerContext');
const rootGlobal = require('../../drive_root/globalServerContext');

// Серверная функция для теста связи
async function testConnection(params, sessionID) {
	if (!sessionID) {
		return { error: 'sessionID required' };
	}
	// Здесь можно добавить проверку валидности sessionID
	let user = await global.getUserBySessionID(sessionID);
	let role = await formsGlobal.getUserAccessRole(user);
	return role;
}

// логиним как гостя
async function loginAsGuest(params, sessionID) {
	const guestUser = await rootGlobal.createGuestUser(sessionID, ['mySpace'], ['public']);
}

module.exports = { testConnection, loginAsGuest };
