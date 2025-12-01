
// db.js — только структура данных для моделей
// Используется в createDB.js для динамического создания моделей


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
                unique: true,
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
                unique: true,
                // убрано ограничение len
            },
            // createdAt будет автоматически добавлен через timestamps: true
            userId: {
                type: 'INTEGER',
                allowNull: true, // теперь разрешено null для гостя
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

module.exports = models;