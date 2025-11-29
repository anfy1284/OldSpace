// db.js — структура данных для моделей уровня drive_forms

const models = [
    {
        name: 'Systems',
        tableName: 'systems',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            name: {
                type: 'STRING',
                allowNull: false,
                unique: true,
            },
            description: {
                type: 'STRING',
                allowNull: true,
            },
            isActive: {
                type: 'BOOLEAN',
                allowNull: false,
                defaultValue: true,
            },
        },
        options: {
            timestamps: true,
        },
    },
    {
        name: 'AccessRoles',
        tableName: 'access_roles',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            name: {
                type: 'STRING',
                allowNull: false,
                unique: true,
            },
        },
        options: {
            timestamps: false,
        },
    },
    {
        name: 'UserSystems',
        tableName: 'user_systems',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            userId: {
                type: 'INTEGER',
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            systemId: {
                type: 'INTEGER',
                allowNull: false,
                references: {
                    model: 'systems',
                    key: 'id',
                },
            },
            roleId: {
                type: 'INTEGER',
                allowNull: true,
                references: {
                    model: 'access_roles',
                    key: 'id',
                },
            },
        },
    },
];

module.exports = models;
