// Server methods main_menu

async function getMainMenuCommands(appsJsonUrl = '/drive_forms/apps.json') {
    const fs = require('fs').promises;
    const path = require('path');
    const result = [];
    try {
        // absolute path to apps.json
        const appsJsonPath = path.resolve(__dirname, '../../drive_forms/apps.json');
        const appsData = JSON.parse(await fs.readFile(appsJsonPath, 'utf8'));
        if (!appsData.apps) return result;

        for (const app of appsData.apps) {
            const configPath = path.resolve(__dirname, `../../apps/${app.name}/config.json`);
            try {
                const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
                if (cfg.mainMenuCommands) {
                    // Inject app name into commands
                    const injectAppName = (items) => {
                        if (!items) return;
                        for (const item of items) {
                            if (item.action) {
                                item.appName = app.name;
                            }
                            if (item.items) {
                                injectAppName(item.items);
                            }
                        }
                    };

                    cfg.mainMenuCommands.forEach(cmd => {
                        if (cmd.items) injectAppName(cmd.items);
                    });

                    result.push(...cfg.mainMenuCommands);
                }
            } catch (e) { }
        }
    } catch (e) { }
    return result;
}

module.exports = {
    getMainMenuCommands
};
