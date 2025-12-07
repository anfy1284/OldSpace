// Global server context
const global = require('../../drive_root/globalServerContext');
const formsGlobal = require('../../drive_forms/globalServerContext');
const rootGlobal = require('../../drive_root/globalServerContext');

// Server function for connection test
async function testConnection(params, sessionID) {
	if (!sessionID) {
		return { error: 'sessionID required' };
	}
	// Here we can add sessionID validity check
	let user = await global.getUserBySessionID(sessionID);
	let role = await formsGlobal.getUserAccessRole(user);
	return role;
}

// login as guest
async function loginAsGuest(params, sessionID) {
	const guestUser = await rootGlobal.createGuestUser(sessionID, ['mySpace'], ['public']);
}

module.exports = { testConnection, loginAsGuest };
