const global = require('../drive_root/globalServerContext');
const eventBus = require('./eventBus');

const fs = require('fs');

// Загрузить client.js приложений, доступных для роли пользователя (склеить текст)
async function loadApps(user) {
  const accessRole = await getUserAccessRole(user);
  const appsJsonPath = path.join(__dirname, 'apps.json');
  const appsConfig = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
  let allCode = '';
  for (const app of appsConfig.apps) {
    const configPath = path.join(__dirname, '..', 'apps', app.name, 'config.json');
    if (!fs.existsSync(configPath)) continue;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(config.access) && config.access.includes(accessRole)) {
            const clientPath = path.join(__dirname, '..', 'apps', app.name, 'resources', 'public', 'client.js');
            if (fs.existsSync(clientPath)) {
                allCode += fs.readFileSync(clientPath, 'utf8') + '\n\n';
            }
    }
  }
  return allCode;
}
// Глобальные функции для серверных модулей drive_forms

const path = require('path');
const Sequelize = require('sequelize');
const sequelize = require('../drive_root/db/sequelize_instance');
const modelsDef = require('./db/db');

const accessRoleDef = modelsDef.find(m => m.name === 'AccessRoles');
const userSystemDef = modelsDef.find(m => m.name === 'UserSystems');

const AccessRole = sequelize.define(accessRoleDef.name, Object.fromEntries(
  Object.entries(accessRoleDef.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
), { ...accessRoleDef.options, tableName: accessRoleDef.tableName });

const UserSystem = sequelize.define(userSystemDef.name, Object.fromEntries(
  Object.entries(userSystemDef.fields).map(([k, v]) => [k, { ...v, type: Sequelize.DataTypes[v.type] }])
), { ...userSystemDef.options, tableName: userSystemDef.tableName });

// Получить AccessRole пользователя по объекту user
async function getUserAccessRole(user) {
    if (!user) return 'nologged';
    // Ищем первую запись user_systems для пользователя
    const userSystem = await UserSystem.findOne({ where: { userId: user.id }, order: [['id', 'ASC']] });
    if (!userSystem || !userSystem.roleId) return null;
    const role = await AccessRole.findOne({ where: { id: userSystem.roleId } });
    return role ? role.name : null;
}

async function createNewUser(sessionID, name, systems, roles) {
    const { modelsDB } = global;
    const sequelizeInstance = modelsDB.Users.sequelize;
    return await sequelizeInstance.transaction(async (t) => {
        // 1. Создать пользователя
        const user = await modelsDB.Users.create({
            isGuest: false,
            name,
            email: `${name.replace(/\s+/g, '_').toLowerCase()}@user.local`,
            password_hash: '',
        }, { transaction: t });

        // 2. Найти или создать все роли
        const roleRecords = [];
        for (const roleName of Array.isArray(roles) ? roles : [roles]) {
            let roleRec = await modelsDB.AccessRoles.findOne({ where: { name: roleName }, transaction: t });
            if (!roleRec) {
                roleRec = await modelsDB.AccessRoles.create({ name: roleName }, { transaction: t });
            }
            roleRecords.push(roleRec);
        }

        // 3. Найти или создать все системы
        const systemRecords = [];
        for (const systemName of Array.isArray(systems) ? systems : [systems]) {
            let systemRec = await modelsDB.Systems.findOne({ where: { name: systemName }, transaction: t });
            if (!systemRec) {
                systemRec = await modelsDB.Systems.create({ name: systemName }, { transaction: t });
            }
            systemRecords.push(systemRec);
        }

        // 4. Связать пользователя с каждой комбинацией роль-система
        for (const roleRec of roleRecords) {
            for (const systemRec of systemRecords) {
                await modelsDB.UserSystems.create({ userId: user.id, roleId: roleRec.id, systemId: systemRec.id }, { transaction: t });
            }
        }

        // 5. Связать пользователя с sessionID (создать сессию или обновить userId)
        if (sessionID) {
            let session = await modelsDB.Sessions.findOne({ where: { sessionId: sessionID }, transaction: t });
            if (!session) {
                await modelsDB.Sessions.create({ sessionId: sessionID, userId: user.id }, { transaction: t });
            } else {
                await session.update({ userId: user.id }, { transaction: t });
            }
        }
        
        // Событие создания пользователя
        await eventBus.emit('userCreated', user, { systems, roles, sessionID });
        
        return user;
    });
}

async function createGuestUser(sessionID, systems, roles) {
    const { modelsDB } = global;
    const sequelize = modelsDB.Users.sequelize;
    // Найти максимальный номер гостя
    return await sequelize.transaction(async (t) => {
        const [result] = await sequelize.query(
            `SELECT name FROM users WHERE "isGuest"=true AND name LIKE 'Guest_%' ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            { transaction: t }
        );
        let nextNum = 1;
        if (result.length > 0) {
            const lastName = result[0].name;
            const match = lastName && lastName.match(/^Guest_(\d+)$/);
            if (match) nextNum = parseInt(match[1], 10) + 1;
        }
        const name = `Guest_${nextNum}`;
        // Используем createNewUser для создания пользователя и всех связей
        const guest = await createNewUser(sessionID, name, systems, roles);
        // Обновляем isGuest и email (если нужно)
        await guest.update({ isGuest: true, email: `guest_${nextNum}@guest.local` }, { transaction: t });
        return guest;
    });
}

module.exports = {
  getUserAccessRole,
  loadApps,
  createGuestUser,
  createNewUser
};
