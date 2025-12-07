// Server methods for fileSystem
const global = require('../../drive_root/globalServerContext');

const fs = require('fs').promises;
const path = require('path');
const config = require('./config.json');
const storagePath = config.storagePath || 'D:\\prj_files';

// Ensure directory exists
fs.mkdir(storagePath, { recursive: true }).catch(() => { });

async function uploadFile(params, sessionID, req, res) {
    // Handle file upload
    // req.file - uploaded file (from multer memoryStorage)
    // params - additional data (parentId, etc.)
    const { parentId } = params;
    const file = req.file;

    if (!file) {
        return { error: 'No file uploaded' };
    }

    // Fix filename encoding
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    console.log('Original name after decode:', originalName);

    // Add record to DB first
    const FileModel = global.modelsDB.FileSystem_Files;
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);

    const newFile = await FileModel.create({
        name: originalName,
        parentId: parentId || null,
        isFolder: false,
        size: file.size,
        filePath: '', // update later
        ownerId: 1 // TODO: get from session
    });

    // Save file with unique name: id + ext
    const uniqueName = `${newFile.id}${ext}`;
    const filePath = path.join(storagePath, uniqueName);
    console.log('Saving file to:', filePath);
    await fs.writeFile(filePath, file.buffer);
    console.log('File saved successfully');

    // Update filePath in DB
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
        ownerId: 1 // TODO: from session
    });

    return { success: true, folder: newFolder };
}

async function downloadFile(params, sessionID, req, res) {
    const { fileId } = params;
    const FileModel = global.modelsDB.FileSystem_Files;
    const fileRecord = await FileModel.findByPk(fileId);

    if (!fileRecord) return { error: 'File not found' };
    if (fileRecord.isFolder) return { error: 'Cannot download directory' };

    const fullPath = path.join(storagePath, fileRecord.filePath);
    try {
        const buffer = await fs.readFile(fullPath);
        return {
            file: {
                name: fileRecord.name,
                data: buffer.toString('base64')
            }
        };
    } catch (e) {
        return { error: 'Read error: ' + e.message };
    }
}

module.exports = {
    uploadFile,
    getFiles,
    createFolder,
    downloadFile
};