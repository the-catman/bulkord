/**
 * IPC handlers for Electron main process.
 */

const { ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const { createInstance } = require("../lib/discord");
const { extractFromPackage } = require("../lib/extractor");

let activeInstance = null;

/**
 * Register all IPC handlers.
 * @param {Object} options - Configuration options
 * @param {Function} options.getMainWindow - Function that returns the main BrowserWindow
 * @param {Function} options.getConfigPath - Function that returns the config file path
 * @param {Function} options.getDbPath - Function that returns the database file path
 * @param {Function} options.getUserDataPath - Function that returns the user data path
 */
function registerHandlers({ getMainWindow, getConfigPath, getDbPath, getUserDataPath }) {
    
    function loadConfig() {
        try {
            return JSON.parse(fs.readFileSync(getConfigPath(), "utf-8"));
        } catch {
            return null;
        }
    }

    function saveConfig(config) {
        fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 4));
    }

    // --- Configuration ---
    ipcMain.handle("config:load", () => loadConfig());

    ipcMain.handle("config:save", (_event, config) => {
        saveConfig(config);
        return { success: true };
    });

    // --- Search ---
    ipcMain.handle("search:start", async () => {
        const config = loadConfig();
        if (!config) return { success: false, error: "No configuration found." };
        if (!config.authToken) return { success: false, error: "Auth token is not set." };
        if (!config.guildId && !config.channelId) return { success: false, error: "Guild ID or Channel ID must be set." };

        activeInstance = createInstance(config, getDbPath());
        try {
            await activeInstance.handleSearchMode((fetched, total) => {
                const mainWindow = getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("search:progress", { fetched, total });
                }
            });
            const count = activeInstance.getMessageCount();
            return { success: true, messageCount: count };
        } catch (err) {
            return { success: false, error: err.message };
        } finally {
            activeInstance.close();
            activeInstance = null;
        }
    });

    // --- Delete ---
    ipcMain.handle("delete:start", async () => {
        const config = loadConfig();
        if (!config) return { success: false, error: "No configuration found." };
        if (!config.authToken) return { success: false, error: "Auth token is not set." };

        activeInstance = createInstance(config, getDbPath());
        const total = activeInstance.getMessageCount();

        if (total === 0) {
            activeInstance.close();
            activeInstance = null;
            return { success: false, error: "No messages in database to delete." };
        }

        try {
            await activeInstance.handleDeleteMode((deleted, result) => {
                const mainWindow = getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("delete:progress", {
                        deleted, total,
                        skipped: result.skipped,
                        reason: result.reason,
                    });
                }
            });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        } finally {
            activeInstance.close();
            activeInstance = null;
        }
    });

    // --- Status ---
    ipcMain.handle("status:get", () => {
        const config = loadConfig();
        let messageCount = 0;
        try {
            const instance = createInstance(config || { channelId: "0", authToken: "" }, getDbPath());
            messageCount = instance.getMessageCount();
            instance.close();
        } catch {}
        return { config, messageCount };
    });

    // --- Operations ---
    ipcMain.handle("operation:cancel", () => {
        if (activeInstance) {
            activeInstance.cancel();
        }
        return { success: true };
    });

    // --- Data Management ---
    ipcMain.handle("data:clear-config", () => {
        try {
            const configPath = getConfigPath();
            if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("data:clear-db", () => {
        try {
            const dbPath = getDbPath();
            if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("data:open-location", () => {
        try {
            shell.showItemInFolder(getUserDataPath());
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // --- Extract ---
    ipcMain.handle("extract:select-folder", async () => {
        const mainWindow = getMainWindow();
        const result = await dialog.showOpenDialog(mainWindow, {
            title: "Select Discord Data Package Messages Folder",
            properties: ["openDirectory"],
        });
        if (result.canceled || result.filePaths.length === 0) return { canceled: true };
        return { canceled: false, path: result.filePaths[0] };
    });

    ipcMain.handle("extract:start", async (_event, packagePath) => {
        const mainWindow = getMainWindow();
        
        const result = extractFromPackage(packagePath, getDbPath(), (current, totalFolders, messagesExtracted) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("extract:progress", {
                    current,
                    totalFolders,
                    messagesExtracted,
                });
            }
        });

        return result;
    });

    return {
        cancelActiveInstance: () => {
            if (activeInstance) {
                activeInstance.cancel();
                activeInstance.close();
                activeInstance = null;
            }
        }
    };
}

module.exports = { registerHandlers };
