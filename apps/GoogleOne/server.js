const global = require('../../drive_root/globalServerContext');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

// Helper to get user settings
async function getUserSetting(userId, settingName) {
    const { modelsDB } = global;
    const field = await modelsDB.UserSettingsFields.findOne({ where: { name: settingName } });
    if (!field) return null;

    // Determine table based on type
    let Model;
    if (field.typeId === 1 || field.typeId === 5) Model = modelsDB.UserSettingsStringValues;
    else if (field.typeId === 2) Model = modelsDB.UserSettingsNumberValues;
    else if (field.typeId === 3) Model = modelsDB.UserSettingsBooleanValues; // Assuming boolean values table exists or uses number/string
    // Note: In defaultValues.json, boolean is typeId 3. Check if UserSettingsBooleanValues exists in models.
    // If not, it might be using Number or String. Let's assume String for tokens and Boolean for connected status if table exists.
    
    // Check if model exists, fallback if needed (e.g. boolean might be stored as number 0/1)
    if (!Model && field.typeId === 3) Model = modelsDB.UserSettingsNumberValues; 

    if (!Model) return null;

    const record = await Model.findOne({
        where: { userId, settingsFieldId: field.id }
    });
    return record ? record.value : null;
}

async function setUserSetting(userId, settingName, value) {
    const { modelsDB } = global;
    const field = await modelsDB.UserSettingsFields.findOne({ where: { name: settingName } });
    if (!field) return;

    let Model;
    if (field.typeId === 1 || field.typeId === 5) Model = modelsDB.UserSettingsStringValues;
    else if (field.typeId === 2) Model = modelsDB.UserSettingsNumberValues;
    else if (field.typeId === 3) Model = modelsDB.UserSettingsBooleanValues || modelsDB.UserSettingsNumberValues;

    if (!Model) return;

    const [record, created] = await Model.findOrCreate({
        where: { userId, settingsFieldId: field.id },
        defaults: { value }
    });

    if (!created) {
        await record.update({ value });
    }
}

async function getOAuth2Client(userId) {
    const clientId = await getUserSetting(userId, 'google_client_id');
    const clientSecret = await getUserSetting(userId, 'google_client_secret');
    
    if (!clientId || !clientSecret) {
        throw new Error('Google Client ID and Secret are not configured.');
    }

    // Redirect URI should be configured in Google Cloud Console to point here
    // We need to know the domain. For now, we can construct it from request if available, 
    // but here we are in a helper. We'll pass it or use a placeholder that user must match.
    // Usually: https://your-domain.com/api/apps/GoogleOne/auth/callback
    // For local dev: http://localhost:3000/api/apps/GoogleOne/auth/callback
    
    // We will determine redirectUrl dynamically in the handler, but for client init we need it.
    // Let's assume we pass it or set it later.
    const oAuth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'postmessage' // or specific URL
    );

    const accessToken = await getUserSetting(userId, 'google_access_token');
    const refreshToken = await getUserSetting(userId, 'google_refresh_token');

    if (accessToken || refreshToken) {
        oAuth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken
        });
    }

    // Auto refresh logic is handled by googleapis if refresh_token is present
    oAuth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            await setUserSetting(userId, 'google_access_token', tokens.access_token);
        }
        if (tokens.refresh_token) {
            await setUserSetting(userId, 'google_refresh_token', tokens.refresh_token);
        }
    });

    return oAuth2Client;
}

async function handleDirectRequest(req, res, pathParts) {
    const { modelsDB, getUserBySessionID } = global;
    
    // Helper for JSON response
    const json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };

    // 1. Get User
    // We need to parse cookies or headers to get session
    // globalServerContext doesn't export session parser directly, but we can try to get sessionID from cookie
    const getSessionID = (req) => {
        const cookie = req.headers.cookie;
        if (!cookie) return null;
        const match = cookie.match(/(?:^|; )sessionID=([^;]+)/i);
        return match ? match[1] : null;
    };
    
    const sessionID = getSessionID(req);
    if (!sessionID) {
        res.statusCode = 401;
        return json({ error: 'Unauthorized' });
    }

    const user = await getUserBySessionID(sessionID);
    if (!user) {
        res.statusCode = 401;
        return json({ error: 'Unauthorized' });
    }

    const action = pathParts[0];

    if (action === 'auth_url') {
        try {
            const clientId = await getUserSetting(user.id, 'google_client_id');
            const clientSecret = await getUserSetting(user.id, 'google_client_secret');
            
            if (!clientId || !clientSecret) {
                return json({ error: 'Client ID and Secret not set' });
            }

            const redirectUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/apps/GoogleOne/auth/callback`;
            
            const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUrl);
            
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/drive'],
                prompt: 'consent' // Force refresh token
            });
            
            return json({ url: authUrl });
        } catch (e) {
            return json({ error: e.message });
        }
    }

    if (action === 'auth_callback') {
        // Handle code from query
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        if (!code) {
            return json({ error: 'No code provided' });
        }

        try {
            const clientId = await getUserSetting(user.id, 'google_client_id');
            const clientSecret = await getUserSetting(user.id, 'google_client_secret');
            const redirectUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/apps/GoogleOne/auth/callback`;

            const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUrl);
            const { tokens } = await oAuth2Client.getToken(code);
            
            oAuth2Client.setCredentials(tokens);

            // Save tokens
            if (tokens.access_token) await setUserSetting(user.id, 'google_access_token', tokens.access_token);
            if (tokens.refresh_token) await setUserSetting(user.id, 'google_refresh_token', tokens.refresh_token);
            await setUserSetting(user.id, 'google_auth_connected', 1); // 1 for true

            // Create Root Folder in FileSystem if not exists
            const folderName = (await getUserSetting(user.id, 'google_drive_folder_name')) || 'Google One';
            
            const FileModel = modelsDB.FileSystem_Files;
            const existingRoot = await FileModel.findOne({
                where: {
                    ownerId: user.id,
                    provider: 'google_drive',
                    parentId: null
                }
            });

            if (!existingRoot) {
                await FileModel.create({
                    name: folderName,
                    isFolder: true,
                    ownerId: user.id,
                    provider: 'google_drive',
                    parentId: null,
                    externalId: 'root' // Google Drive root alias
                });
            } else {
                // Update name if changed
                if (existingRoot.name !== folderName) {
                    await existingRoot.update({ name: folderName });
                }
            }

            // Redirect back to settings or close window
            res.writeHead(302, { Location: '/?app=GoogleOne' }); // Adjust as needed
            res.end();
        } catch (e) {
            console.error('Auth Error:', e);
            res.statusCode = 500;
            res.end('Authentication failed: ' + e.message);
        }
        return;
    }

    if (action === 'disconnect') {
        await setUserSetting(user.id, 'google_access_token', '');
        await setUserSetting(user.id, 'google_refresh_token', '');
        await setUserSetting(user.id, 'google_auth_connected', 0);
        
        // Optionally remove files from DB? Or keep them as cache?
        // For now, let's keep them but they won't work.
        return json({ success: true });
    }
    
    if (action === 'save_config') {
        // Expect POST body
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                if (data.clientId) await setUserSetting(user.id, 'google_client_id', data.clientId);
                if (data.clientSecret) await setUserSetting(user.id, 'google_client_secret', data.clientSecret);
                if (data.folderName) await setUserSetting(user.id, 'google_drive_folder_name', data.folderName);
                
                json({ success: true });
            } catch (e) {
                json({ error: e.message });
            }
        });
        return;
    }
    
    if (action === 'get_status') {
        const connected = await getUserSetting(user.id, 'google_auth_connected');
        const folderName = await getUserSetting(user.id, 'google_drive_folder_name');
        const clientId = await getUserSetting(user.id, 'google_client_id');
        // Don't send secret
        json({ 
            connected: !!connected, 
            folderName: folderName || 'Google One',
            hasClientId: !!clientId
        });
        return;
    }

    res.statusCode = 404;
    res.end('Not Found');
}

// Export for FileSystem integration
async function getDriveClient(userId) {
    try {
        const auth = await getOAuth2Client(userId);
        return google.drive({ version: 'v3', auth });
    } catch (e) {
        console.error('Error getting drive client:', e.message);
        return null;
    }
}

module.exports = {
    handleDirectRequest,
    getDriveClient
};
