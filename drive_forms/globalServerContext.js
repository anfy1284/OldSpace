const global = require('../drive_root/globalServerContext');
const eventBus = require('../drive_root/eventBus');
const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../drive_root/db/sequelize_instance');
async function loadApps(user) {
  const accessRole = await getUserAccessRole(user);
  console.log(`[loadApps] Loading apps for user: ${user ? user.name : 'null'}, role: ${accessRole}`);
  const appsJsonPath = path.join(__dirname, 'apps.json');
  const appsConfig = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
  let allCode = '';
  for (const app of appsConfig.apps) {
    const configPath = path.join(__dirname, '..', 'apps', app.name, 'config.json');
    if (!fs.existsSync(configPath)) continue;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(config.access) && config.access.includes(accessRole)) {
      console.log(`[loadApps] Loading app: ${app.name}`);
      // Only load apps marked with autoStart: true
      if (config.autoStart === true) {
        const clientPath = path.join(__dirname, '..', 'apps', app.name, 'resources', 'public', 'client.js');
        if (fs.existsSync(clientPath)) {
          allCode += fs.readFileSync(clientPath, 'utf8') + '\n\n';
        }
      }
    } else {
      // console.log(`[loadApps] Skipping app ${app.name} (access denied for role ${accessRole})`);
    }
  }
  return allCode;
}
// Global functions for drive_forms server modules

const modelsDef = require('./db/db');

const accessRoleDef = modelsDef.find(m => m.name === 'AccessRoles');
const userSystemDef = modelsDef.find(m => m.name === 'UserSystems');

const AccessRole = sequelize.define(accessRoleDef.name, Object.fromEntries(
  Object.entries(accessRoleDef.fields).map(([k, v]) => [k, { ...v, type: DataTypes[v.type] }])
), { ...accessRoleDef.options, tableName: accessRoleDef.tableName });

const UserSystem = sequelize.define(userSystemDef.name, Object.fromEntries(
  Object.entries(userSystemDef.fields).map(([k, v]) => [k, { ...v, type: DataTypes[v.type] }])
), { ...userSystemDef.options, tableName: userSystemDef.tableName });

// Get AccessRole for user object
async function getUserAccessRole(user) {
  if (!user) return 'nologged';
  // Find first user_systems record for user
  const userSystem = await UserSystem.findOne({ where: { userId: user.id }, order: [['id', 'ASC']] });
  if (!userSystem || !userSystem.roleId) {
    console.log(`[getUserAccessRole] No userSystem or roleId found for user ${user.id}`);
    return null;
  }
  const role = await AccessRole.findOne({ where: { id: userSystem.roleId } });
  if (!role) {
    console.log(`[getUserAccessRole] Role not found for roleId ${userSystem.roleId}`);
    return null;
  }
  return role ? role.name : null;
}

module.exports = {
  getUserAccessRole,
  loadApps,
  // User management is no longer at this level
};
