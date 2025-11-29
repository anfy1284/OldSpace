const models = [
    {
        name: 'Messenger_Chats',
        tableName: 'Messenger_Chats',
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
        name: 'Messenger_Messages',
        tableName: 'Messenger_Messages',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            chatId: {
                type: 'INTEGER',
                allowNull: false,
                references: {
                    model: 'Messenger_Chats',
                    key: 'id',
                },
            },
            userId: {
                type: 'INTEGER',
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
            content: {
                type: 'STRING',
                allowNull: false,
            },
            isRead: {
                type: 'BOOLEAN',
                allowNull: false,
                defaultValue: false,
            },
            isDelivered: {
                type: 'BOOLEAN',
                allowNull: false,
                defaultValue: false,
            },
        },
        options: {
            timestamps: true,
        },
    }
];

module.exports = models;
