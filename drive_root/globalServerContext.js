const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const sequelize = require('./db/sequelize_instance');

// Генерация моделей из массива описаний
function generateModelsFromDefs(modelDefs) {
    const models = {};
    for (const def of modelDefs) {
        models[def.name] = sequelize.define(
            def.name,
            Object.fromEntries(
                Object.entries(def.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
            ),
            { ...def.options, tableName: def.tableName }
        );
    }
    return models;
}

// Собираем все db.js (drive_root, appDir, ...)
function collectAllModelDefs() {
    const defs = [];
    // 1. drive_root/db/db.js
    const rootDbPath = path.join(__dirname, 'db', 'db.js');
    if (fs.existsSync(rootDbPath)) {
        const rootModels = require(rootDbPath);
        defs.push(...(rootModels.models || rootModels));
    }
    // 2. appDir/db/db.js (например, drive_forms)
    const config = require(path.join(__dirname, '..', 'server.config.json'));
    const appDir = path.join(__dirname, '..', config.appDir);
    const appDbPath = path.join(appDir, 'db', 'db.js');
    if (fs.existsSync(appDbPath)) {
        const appModels = require(appDbPath);
        defs.push(...(appModels.models || appModels));
    }
    // (Для простоты: вложенные apps не добавляем)
    return defs;
}

// Глобальная переменная с моделями
let modelsDB = {};

function initModelsDB() {
    const allDefs = collectAllModelDefs();
    modelsDB = generateModelsFromDefs(allDefs);
}

// Инициализация при запуске
initModelsDB();


function getServerTime() {
    return new Date().toISOString();
}

function helloFromGlobal(name) {
    return `Hello, ${name}! (from globalServerContext)`;
}

// Здесь можно экспортировать любые функции, объекты, константы


// Получить пользователя по sessionID (асинхронно)
const modelsDef = require('./db/db');
const sessionDef = modelsDef.find(m => m.name === 'Sessions');
const userDef = modelsDef.find(m => m.name === 'Users');
const Session = sequelize.define(sessionDef.name, Object.fromEntries(
    Object.entries(sessionDef.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
), { ...sessionDef.options, tableName: sessionDef.tableName });
const User = sequelize.define(userDef.name, Object.fromEntries(
    Object.entries(userDef.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
), { ...userDef.options, tableName: userDef.tableName });
async function getUserBySessionID(sessionID) {
    if (!sessionID) return null;
    const session = await Session.findOne({ where: { sessionId: sessionID } });
    if (!session || !session.userId) return null;
    const user = await User.findOne({ where: { id: session.userId } });
    return user ? user.get({ plain: true }) : null;
}

module.exports = {
        getServerTime,
        helloFromGlobal,
        getUserBySessionID,
        modelsDB,
        initModelsDB,
};
