// Server methods for fileSystem
const global = require('../../drive_root/globalServerContext');

const fs = require('fs').promises;
const path = require('path');
const yauzl = require('yauzl');
const { Op } = require('sequelize');
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

    const fullPath = await resolveStoredFilePath(fileRecord);
    if (!fullPath) return { error: 'File not found on disk: ' + (fileRecord.filePath || '') };
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

async function deleteFile(params, sessionID) {
    const { fileId } = params;
    if (!fileId) return { error: 'fileId required' };
    const FileModel = global.modelsDB.FileSystem_Files;
    // Use a transaction so DB changes rollback if any disk operation fails
    const sequelizeInstance = FileModel.sequelize;
    try {
        return await sequelizeInstance.transaction(async (t) => {
            // Reload record inside transaction
            const fileRecord = await FileModel.findByPk(fileId, { transaction: t });
            if (!fileRecord) throw new Error('File not found');

            // Recursive delete function
            async function deleteNode(rec) {
                if (rec.isFolder) {
                    const children = await FileModel.findAll({ where: { parentId: rec.id }, transaction: t });
                    for (const child of children) {
                        await deleteNode(child);
                    }
                    await rec.destroy({ transaction: t });
                } else {
                    // Delete file from disk; if fails, throw to rollback
                    if (rec.filePath) {
                        const fullPath = await resolveStoredFilePath(rec);
                        if (fullPath) {
                            try {
                                await fs.unlink(fullPath);
                            } catch (e) {
                                throw new Error('File unlink error: ' + e.message);
                            }
                        } else {
                            // file not found on disk - consider it OK or throw depending on policy
                            // Here we throw to notify caller
                            throw new Error('File not found on disk: ' + rec.filePath);
                        }
                    }
                    await rec.destroy({ transaction: t });
                }
            }

            await deleteNode(fileRecord);
            return { success: true };
        });
    } catch (e) {
        // Return error so client can call showAlert
        return { error: e.message || 'Delete failed' };
    }
}

async function getFolder(params, sessionID) {
    const { id } = params;
    if (!id) return { error: 'id required' };
    const FileModel = global.modelsDB.FileSystem_Files;
    const folder = await FileModel.findByPk(id);
    if (!folder) return { error: 'Folder not found' };
    return folder.get({ plain: true });
}

// Helper: resolve stored file path with a few fallbacks (absolute, joined with storagePath, basename)
async function resolveStoredFilePath(fileRecord) {
    const p = fileRecord.filePath || '';
    const candidates = [];
    try {
        if (path.isAbsolute(p)) candidates.push(p);
    } catch (e) {}
    candidates.push(path.join(storagePath, p));
    candidates.push(path.join(storagePath, path.basename(p)));
    candidates.push(p);

    for (const c of candidates) {
        try {
            // use fs.stat to check existence
            await fs.stat(c);
            return c;
        } catch (e) {
            // ignore
        }
    }
    return null;
}

// List entries inside zip archive (no temp files written)
async function listArchive(params, sessionID) {
    const { fileId } = params;
    if (!fileId) return { error: 'fileId required' };
    const FileModel = global.modelsDB.FileSystem_Files;
    const fileRecord = await FileModel.findByPk(fileId);
    if (!fileRecord) return { error: 'File not found' };
    if (fileRecord.isFolder) return { error: 'Not a file' };
    // resolve the actual on-disk path
    const fullPath = await resolveStoredFilePath(fileRecord);
    if (!fullPath) return { error: 'File not found on disk: ' + (fileRecord.filePath || '') };
    try {
        const buffer = await fs.readFile(fullPath);
        return await new Promise((resolve) => {
            yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
                if (err) return resolve({ error: 'Zip open error: ' + err.message });
                const entries = [];
                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    const isDir = /\/$/.test(entry.fileName);
                    const name = entry.fileName.replace(/\/$/, '').split('/').pop() || entry.fileName;
                    entries.push({ path: entry.fileName, name, isFolder: isDir, size: entry.uncompressedSize });
                    zipfile.readEntry();
                });
                zipfile.on('end', () => {
                    try { zipfile.close(); } catch (e) {}
                    resolve({ name: fileRecord.name, entries });
                });
            });
        });
    } catch (e) {
        return { error: 'Read error: ' + e.message };
    }
}

// Extract a single archive entry and return base64 data (no temp files)
async function extractArchiveEntry(params, sessionID) {
    const { fileId, entryPath } = params;
    if (!fileId || !entryPath) return { error: 'fileId and entryPath required' };
    const FileModel = global.modelsDB.FileSystem_Files;
    const fileRecord = await FileModel.findByPk(fileId);
    if (!fileRecord) return { error: 'File not found' };
    const fullPath = await resolveStoredFilePath(fileRecord);
    if (!fullPath) return { error: 'File not found on disk: ' + (fileRecord.filePath || '') };
    try {
        const buffer = await fs.readFile(fullPath);
        return await new Promise((resolve) => {
            yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
                if (err) return resolve({ error: 'Zip open error: ' + err.message });
                let found = false;
                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    if (entry.fileName === entryPath) {
                        found = true;
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                try { zipfile.close(); } catch (e) {}
                                return resolve({ error: 'Read stream error: ' + err.message });
                            }
                            const chunks = [];
                            readStream.on('data', (c) => chunks.push(c));
                            readStream.on('end', () => {
                                try { zipfile.close(); } catch (e) {}
                                const buf = Buffer.concat(chunks);
                                return resolve({ file: { name: path.basename(entry.fileName), data: buf.toString('base64') } });
                            });
                            readStream.on('error', (e) => {
                                try { zipfile.close(); } catch (ee) {}
                                return resolve({ error: 'Stream error: ' + e.message });
                            });
                        });
                    } else {
                        zipfile.readEntry();
                    }
                });
                zipfile.on('end', () => {
                    if (!found) {
                        try { zipfile.close(); } catch (e) {}
                        resolve({ error: 'Entry not found' });
                    }
                });
            });
        });
    } catch (e) {
        return { error: 'Read error: ' + e.message };
    }
}

// Debug helper: return candidate paths and existence for a file record
async function debugFilePath(params, sessionID) {
    const { fileId } = params || {};
    if (!fileId) return { error: 'fileId required' };
    const FileModel = global.modelsDB.FileSystem_Files;
    const fileRecord = await FileModel.findByPk(fileId);
    if (!fileRecord) return { error: 'File not found' };
    const p = fileRecord.filePath || '';
    const candidates = [];
    try {
        if (path.isAbsolute(p)) candidates.push(p);
    } catch (e) {}
    candidates.push(path.join(storagePath, p));
    candidates.push(path.join(storagePath, path.basename(p)));
    candidates.push(p);

    const results = [];
    for (const c of candidates) {
        try {
            const st = await fs.stat(c);
            results.push({ path: c, exists: true, isFile: st.isFile(), isDirectory: st.isDirectory() });
        } catch (e) {
            results.push({ path: c, exists: false, error: e.message });
        }
    }

    return { fileId, filePath: p, storagePath: storagePath, storagePathResolved: path.resolve(storagePath), candidates: results };
}

module.exports = {
    uploadFile,
    getFiles,
    createFolder,
    downloadFile,
    deleteFile,
    getFolder,
    listArchive,
    extractArchiveEntry,
    debugFilePath
};