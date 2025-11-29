// sessionManager.js
// Управление сессиями: кэш + работа с БД через Sequelize

const path = require('path');
const Sequelize = require('sequelize');
const sequelize = require('./sequelize_instance');
const modelsDef = require('./db');

// Динамически создаём модель Sessions (и Users, если нужно)
const sessionDef = modelsDef.find(m => m.name === 'Sessions');
const userDef = modelsDef.find(m => m.name === 'Users');

const Session = sequelize.define(sessionDef.name, Object.fromEntries(
  Object.entries(sessionDef.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
), { ...sessionDef.options, tableName: sessionDef.tableName });

const User = sequelize.define(userDef.name, Object.fromEntries(
  Object.entries(userDef.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
), { ...userDef.options, tableName: userDef.tableName });

// Кэш сессий: Map<sessionId, { userId, isGuest, sessionId }>
const sessionCache = new Map();

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    cookies[name] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

async function getOrCreateSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let sessionId = cookies.sessionID;
  let session = null;

  // Проверяем кэш
  if (sessionId && sessionCache.has(sessionId)) {
    session = sessionCache.get(sessionId);
  } else if (sessionId) {
    // Проверяем БД
    session = await Session.findOne({ where: { sessionId } });
    if (session) {
      sessionCache.set(sessionId, session);
    }
  }

  // Если сессии нет — создаём новую
  if (!session) {
    // Удаляем старую сессию, если была
    if (sessionId) {
      await Session.destroy({ where: { sessionId } });
      sessionCache.delete(sessionId);
    }
    // Генерируем новую
    sessionId = generateSessionId();
    session = await Session.create({ sessionId, userId: null, isGuest: true });
    sessionCache.set(sessionId, session);
    // Устанавливаем cookie
    res.setHeader('Set-Cookie', `sessionID=${sessionId}; Path=/; HttpOnly`);
  }

  return session;
}

function generateSessionId() {
  // UUID-like, но можно заменить на uuid/v4
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  ).slice(0, 36);
}

module.exports = {
  getOrCreateSession,
  sessionCache,
};
