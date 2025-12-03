const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const sequelize = require('./db/sequelize_instance');
const eventBus = require('./eventBus');
const util = require('util');

// Override console.error to print messages in red for easier spotting in terminal
// Uses ANSI escape codes; falls back to original if formatting fails.
try {
    const _origConsoleError = console.error.bind(console);
    console.error = function(...args) {
        try {
            const red = '\x1b[31m';
            const reset = '\x1b[0m';
            _origConsoleError(red + util.format(...args) + reset);
        } catch (e) {
            _origConsoleError(...args);
        }
    };
} catch (e) {
    // ignore if we can't patch console
}

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
    const associations = [];
    
    // 1. drive_root/db/db.js
    const rootDbPath = path.join(__dirname, 'db', 'db.js');
    if (fs.existsSync(rootDbPath)) {
        const rootExport = require(rootDbPath);
        const rootModels = rootExport.models || rootExport;
        const rootAssoc = rootExport.associations || [];
        defs.push(...(Array.isArray(rootModels) ? rootModels : []));
        associations.push(...rootAssoc);
    }
    // 2. appDir/db/db.js (например, drive_forms)
    const config = require(path.join(__dirname, '..', 'server.config.json'));
    const appDir = path.join(__dirname, '..', config.appDir);
    const appDbPath = path.join(appDir, 'db', 'db.js');
    if (fs.existsSync(appDbPath)) {
        const appExport = require(appDbPath);
        const appModels = appExport.models || appExport;
        const appAssoc = appExport.associations || [];
        defs.push(...(Array.isArray(appModels) ? appModels : []));
        associations.push(...appAssoc);
    }
    // 3. Модели приложений из drive_forms/apps.json
    try {
        const appsJsonPath = path.join(appDir, 'apps.json');
        if (fs.existsSync(appsJsonPath)) {
            const appsConfig = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
            // База для приложений берётся из конфигурации apps.json: { path: "/apps" }
            if (typeof appsConfig.path === 'string' && appsConfig.path.length > 0) {
                const appsPathCfg = appsConfig.path.replace(/^[/\\]+/, '');
                const appsBaseDir = path.join(__dirname, '..', appsPathCfg);
                if (Array.isArray(appsConfig.apps)) {
                    for (const app of appsConfig.apps) {
                        const appDirPath = path.join(appsBaseDir, app.name);
                        const appDbDefPath = path.join(appDirPath, 'db', 'db.js');
                        if (fs.existsSync(appDbDefPath)) {
                            try {
                                const appExport = require(appDbDefPath);
                                const appModels = appExport.models || appExport;
                                const appAssoc = appExport.associations || [];
                                defs.push(...(Array.isArray(appModels) ? appModels : []));
                                associations.push(...appAssoc);
                            } catch (e) {
                                console.error(`[globalModels] Ошибка загрузки моделей приложения ${app.name}:`, e.message);
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('[globalModels] Ошибка чтения apps.json:', e.message);
    }
    return { models: defs, associations };
}

// Глобальная переменная с моделями
let modelsDB = {};

function initModelsDB() {
    const { models: allDefs, associations: allAssoc } = collectAllModelDefs();
    modelsDB = generateModelsFromDefs(allDefs);
    
    // Применяем ассоциации после создания всех моделей
    for (const assoc of allAssoc) {
        const sourceModel = modelsDB[assoc.source];
        const targetModel = modelsDB[assoc.target];
        
        if (!sourceModel) {
            console.warn(`[globalModels] Модель ${assoc.source} не найдена для ассоциации`);
            continue;
        }
        if (!targetModel) {
            console.warn(`[globalModels] Модель ${assoc.target} не найдена для ассоциации`);
            continue;
        }
        
        try {
            sourceModel[assoc.type](targetModel, assoc.options);
        } catch (e) {
            console.error(`[globalModels] Ошибка создания ассоциации ${assoc.source}.${assoc.type}(${assoc.target}):`, e.message);
        }
    }
}

// Инициализация при запуске
initModelsDB();


function getServerTime() {
    return new Date().toISOString();
}

function helloFromGlobal(name) {
    return `Hello, ${name}! (from globalServerContext)`;
}

// Универсальная функция определения Content-Type для файлов
function getContentType(fileName) {
    const ext = require('path').extname(fileName).toLowerCase();
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

// Обработка предопределенных значений
// Добавляет _level к каждой записи и проверяет уникальность id в пределах уровня
function processDefaultValues(data, level) {
    const result = {};
    const allIds = new Set();
    
    for (const [entity, records] of Object.entries(data)) {
        if (!Array.isArray(records)) {
            result[entity] = records;
            continue;
        }
        
        // Проверяем уникальность id в пределах уровня (все таблицы)
        for (const record of records) {
            if (record.id !== undefined) {
                if (allIds.has(record.id)) {
                    console.error(`[defaultValues] ОШИБКА: Дублирующийся id=${record.id} в таблице "${entity}" (id должен быть уникален в пределах уровня "${level}")`);
                }
                allIds.add(record.id);
            } else {
                console.warn(`[defaultValues] ПРЕДУПРЕЖДЕНИЕ: Запись в "${entity}" не имеет поля id`);
            }
        }
        
        result[entity] = records.map(record => ({
            ...record,
            _level: level
        }));
    }
    return result;
}

// Хранилище предопределённых данных: { level: { tableName: { defaultValueId: recordInstance } } }
let defaultValuesCache = {};

/**
 * Загружает все предопределённые данные из таблицы default_values
 * и кеширует Sequelize-инстансы записей для быстрого доступа
 * Возвращает структуру: { level: { tableName: { defaultValueId: recordInstance } } }
 */
async function loadDefaultValuesFromDB() {
    const DefaultValuesModel = modelsDB.DefaultValues;
    if (!DefaultValuesModel) {
        console.error('[defaultValues] Модель DefaultValues не найдена в modelsDB');
        return {};
    }
    
    const cache = {};
    
    try {
        // Загружаем все записи из default_values
        const allDefaults = await DefaultValuesModel.findAll();
        
        // Группируем по уровню и таблице
        for (const defValue of allDefaults) {
            const { level, tableName, defaultValueId, recordId } = defValue;
            
            // Находим модель для таблицы
            const modelDef = Object.values(modelsDB).find(m => m.tableName === tableName);
            if (!modelDef) {
                console.warn(`[defaultValues] Модель для таблицы ${tableName} не найдена`);
                continue;
            }
            
            // Загружаем запись из БД
            const record = await modelDef.findByPk(recordId);
            if (!record) {
                console.warn(`[defaultValues] Запись ${tableName}[${recordId}] не найдена (level=${level}, defaultValueId=${defaultValueId})`);
                continue;
            }
            
            // Кешируем
            if (!cache[level]) cache[level] = {};
            if (!cache[level][tableName]) cache[level][tableName] = {};
            cache[level][tableName][defaultValueId] = record;
        }
        
        console.log(`[defaultValues] Загружено ${allDefaults.length} предопределённых записей из БД`);
    } catch (error) {
        console.error('[defaultValues] Ошибка загрузки из БД:', error.message);
    }
    
    defaultValuesCache = cache;
    return cache;
}

/**
 * Получить Sequelize-инстанс предопределённой записи
 * @param {string} level - Уровень (например, 'messenger', 'root', 'forms')
 * @param {string} tableName - Имя таблицы
 * @param {number} defaultValueId - ID предопределённого значения
 * @returns {Object|null} - Sequelize-инстанс записи или null
 */
function getDefaultValue(level, tableName, defaultValueId) {
    if (!defaultValuesCache[level]) return null;
    if (!defaultValuesCache[level][tableName]) return null;
    return defaultValuesCache[level][tableName][defaultValueId] || null;
}

/**
 * Получить все предопределённые записи для таблицы по уровню
 * @param {string} level - Уровень
 * @param {string} tableName - Имя таблицы
 * @returns {Array} - Массив Sequelize-инстансов
 */
function getDefaultValues(level, tableName) {
    if (!defaultValuesCache[level]) return [];
    if (!defaultValuesCache[level][tableName]) return [];
    return Object.values(defaultValuesCache[level][tableName]);
}

/**
 * Перезагрузить кеш предопределённых данных из БД
 * Полезно после миграции или изменений в default_values
 */
async function reloadDefaultValues() {
    return await loadDefaultValuesFromDB();
}

module.exports = {
    getServerTime,
    helloFromGlobal,
    getUserBySessionID,
    modelsDB,
    initModelsDB,
    getContentType,
    processDefaultValues,
    loadDefaultValuesFromDB,
    getDefaultValue,
    getDefaultValues,
    reloadDefaultValues,
};

// --- Управление пользователями перенесено на уровень drive_root ---
async function createNewUser(sessionID, name, systems, roles, isGuest = false, guestEmail = null) {
    const sequelizeInstance = modelsDB.Users.sequelize;
    const user = await sequelizeInstance.transaction(async (t) => {
        const user = await modelsDB.Users.create({
            isGuest,
            name,
            email: guestEmail || `${name.replace(/\s+/g, '_').toLowerCase()}@user.local`,
            password_hash: '',
        }, { transaction: t });

        const roleRecords = [];
        for (const roleName of Array.isArray(roles) ? roles : [roles]) {
            let roleRec = await modelsDB.AccessRoles.findOne({ where: { name: roleName }, transaction: t });
            if (!roleRec) {
                roleRec = await modelsDB.AccessRoles.create({ name: roleName }, { transaction: t });
            }
            roleRecords.push(roleRec);
        }

        const systemRecords = [];
        for (const systemName of Array.isArray(systems) ? systems : [systems]) {
            let systemRec = await modelsDB.Systems.findOne({ where: { name: systemName }, transaction: t });
            if (!systemRec) {
                systemRec = await modelsDB.Systems.create({ name: systemName }, { transaction: t });
            }
            systemRecords.push(systemRec);
        }

        for (const roleRec of roleRecords) {
            for (const systemRec of systemRecords) {
                await modelsDB.UserSystems.create({ userId: user.id, roleId: roleRec.id, systemId: systemRec.id }, { transaction: t });
            }
        }

        if (sessionID) {
            let session = await modelsDB.Sessions.findOne({ where: { sessionId: sessionID }, transaction: t });
            if (!session) {
                await modelsDB.Sessions.create({ sessionId: sessionID, userId: user.id }, { transaction: t });
            } else {
                await session.update({ userId: user.id }, { transaction: t });
            }
        }

        return user;
    });

    // Эмитируем событие ПОСЛЕ завершения транзакции, когда пользователь уже в БД
    await eventBus.emit('userCreated', user, { systems, roles, sessionID });
    return user;
}

async function createGuestUser(sessionID, systems, roles) {
    const sequelizeInstance = modelsDB.Users.sequelize;
    
    // Находим последнего гостя в транзакции с FOR UPDATE
    const [result] = await sequelizeInstance.query(
        `SELECT name FROM users WHERE "isGuest"=true AND name LIKE 'Guest\\_%' ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    
    let nextNum = 1;
    if (result.length > 0) {
        const lastName = result[0].name;
        const match = lastName && lastName.match(/^Guest_(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    
    const name = `Guest_${nextNum}`;
    const guestEmail = `guest_${nextNum}@guest.local`;
    
    // Вызываем createNewUser с флагом isGuest=true
    return await createNewUser(sessionID, name, systems, roles, true, guestEmail);
}

// Экспортируем новые функции в глобальный контекст
module.exports.createNewUser = createNewUser;
module.exports.createGuestUser = createGuestUser;
