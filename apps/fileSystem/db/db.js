const models = [
    {
        name: 'FileSystem_Files',
        tableName: 'FileSystem_Files',
        fields: {
            id: {
                type: 'INTEGER',
                primaryKey: true,
                autoIncrement: true,
            },
            name: {
                type: 'STRING',
                allowNull: false,
            },
            parentId: {
                type: 'INTEGER',
                allowNull: true,
                references: {
                    model: 'FileSystem_Files',
                    key: 'id',
                },
            },
            isFolder: {
                type: 'BOOLEAN',
                allowNull: false,
                defaultValue: false,
            },
            size: {
                type: 'INTEGER',
                allowNull: false,
                defaultValue: 0,
            },
            filePath: {
                type: 'STRING',
                allowNull: true,
            },
            ownerId: {
                type: 'INTEGER',
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
            },
        },
        options: {
            timestamps: true,
        },
    }
];

const associations = [
    {
        source: 'FileSystem_Files',
        target: 'FileSystem_Files',
        type: 'hasMany',
        options: {
            foreignKey: 'parentId',
            as: 'children'
        }
    },
    {
        source: 'FileSystem_Files',
        target: 'FileSystem_Files',
        type: 'belongsTo',
        options: {
            foreignKey: 'parentId',
            as: 'parent'
        }
    },
    {
        source: 'FileSystem_Files',
        target: 'Users',
        type: 'belongsTo',
        options: {
            foreignKey: 'ownerId',
            as: 'owner'
        }
    }
];

module.exports = { models, associations };
