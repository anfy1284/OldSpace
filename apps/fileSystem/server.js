// Серверные методы для fileSystem
const global = require('../../drive_root/globalServerContext');

const fs = require('fs').promises;
const path = require('path');
const config = require('./config.json');
const storagePath = config.storagePath || 'D:\\prj_files';

// Убедимся, что директория существует
fs.mkdir(storagePath, { recursive: true }).catch(() => {});

async function uploadFile(params, sessionID, req, res) {
    // Обработка загрузки файла
    // req.file - загруженный файл (из multer memoryStorage)
    // params - дополнительные данные (parentId, etc.)
    const { parentId } = params;
    const file = req.file;

    if (!file) {
        return { error: 'No file uploaded' };
    }

    // Исправляем кодировку имени файла
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    console.log('Original name after decode:', originalName);

    // Добавить запись в БД сначала
    const FileModel = global.modelsDB.FileSystem_Files;
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);

    const newFile = await FileModel.create({
        name: originalName,
        parentId: parentId || null,
        isFolder: false,
        size: file.size,
        filePath: '', // обновим позже
        ownerId: 1 // TODO: взять из сессии
    });

    // Сохранить файл под уникальным именем: id + ext
    const uniqueName = `${newFile.id}${ext}`;
    const filePath = path.join(storagePath, uniqueName);
    console.log('Saving file to:', filePath);
    await fs.writeFile(filePath, file.buffer);
    console.log('File saved successfully');

    // Обновить filePath в БД
    const relativePath = path.relative(storagePath, filePath).replace(/\\/g, '/');
    await newFile.update({ filePath: relativePath });

    return { success: true, file: newFile };
}

async function getFiles(params, sessionID, req, res) {
    const { parentId } = params;
    const FileModel = global.modelsDB.FileSystem_Files;

    const files = await FileModel.findAll({
        where: { parentId: parentId || null },
        include: [{ model: global.modelsDB.Users, as: 'owner' }]
    });

    return files;
}

async function createFolder(params, sessionID, req, res) {
    const { name, parentId } = params;
    const FileModel = global.modelsDB.FileSystem_Files;

    const newFolder = await FileModel.create({
        name,
        parentId: parentId || null,
        isFolder: true,
        size: 0,
        ownerId: 1 // TODO: из сессии
    });

    return { success: true, folder: newFolder };
}

module.exports = {
    uploadFile,
    getFiles,
    createFolder
};