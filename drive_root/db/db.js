
// db.js - data structure for models only
// Used in createDB.js for dynamic model creation


const models = [
    {
        name: 'DefaultValues',
        tableName: 'default_values',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            level: {
                type: 'STRING',
                allowNull: false,
            },
            defaultValueId: {
                type: 'INTEGER',
                allowNull: false,
            },
            tableName: {
                type: 'STRING',
                allowNull: false,
            },
            recordId: {
                type: 'INTEGER',
                allowNull: false,
            },
        },
        options: {
            timestamps: true,
            indexes: [
                {
                    unique: true,
                    fields: ['level', 'defaultValueId', 'tableName']
                }
            ]
        },
    },
    {
        name: 'Users',
        tableName: 'users',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            email: {
                type: 'STRING',
                allowNull: true,
                validate: {
                    isEmail: true,
                },
            },
            name: {
                type: 'STRING',
                allowNull: false,
                unique: false,
            },
            password_hash: {
                type: 'STRING',
                allowNull: true,
            },
            isGuest: {
                type: 'BOOLEAN',
                allowNull: false,
                defaultValue: false,
            },
        },
        options: {
            timestamps: true,
            defaultScope: {
                attributes: { exclude: ['password_hash'] },
            },
            scopes: {
                withPassword: {
                    attributes: {},
                },
            },
        },
    },
    {
        name: 'Sessions',
        tableName: 'sessions',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            sessionId: {
                type: 'STRING',
                allowNull: false,
                // len constraint removed
            },
            // createdAt will be automatically added via timestamps: true
            userId: {
                type: 'INTEGER',
                allowNull: true, // now allowed to be null for guests
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            isGuest: {
                type: 'BOOLEAN',
                allowNull: false,
                defaultValue: false,
            },
        },
        options: {
            timestamps: true,
        },
    },
];

const DEFAULT_VALUES_TABLE = 'default_values';

module.exports = models;
module.exports.DEFAULT_VALUES_TABLE = DEFAULT_VALUES_TABLE;