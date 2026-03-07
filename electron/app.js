const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { createInstance } = require("../main");

let mainWindow;
let activeInstance = null;
let CONFIG_PATH;
let DB_PATH;

function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
        return null;
    }
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 860,
        height: 600,
        minWidth: 700,
        minHeight: 500,
        backgroundColor: "#1e1f22",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoHideMenuBar: true,
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: "#1e1f22",
            symbolColor: "#949ba4",
            height: 36,
        },
    });

    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
    CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
    DB_PATH = path.join(app.getPath("userData"), "messages.db");
    createWindow();
});

app.on("window-all-closed", () => {
    if (activeInstance) {
        activeInstance.cancel();
        activeInstance.close();
        activeInstance = null;
    }
    app.quit();
});

// --- IPC Handlers ---

ipcMain.handle("config:load", () => loadConfig());

ipcMain.handle("config:save", (_event, config) => {
    saveConfig(config);
    return { success: true };
});

ipcMain.handle("search:start", async () => {
    const config = loadConfig();
    if (!config) return { success: false, error: "No configuration found." };
    if (!config.authToken) return { success: false, error: "Auth token is not set." };
    if (!config.authorId) return { success: false, error: "Author ID is not set." };
    if (!config.guildId && !config.channelId) return { success: false, error: "Guild ID or Channel ID must be set." };

    activeInstance = createInstance(config, DB_PATH);
    try {
        await activeInstance.handleSearchMode((fetched, total) => {
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

ipcMain.handle("delete:start", async () => {
    const config = loadConfig();
    if (!config) return { success: false, error: "No configuration found." };
    if (!config.authToken) return { success: false, error: "Auth token is not set." };

    activeInstance = createInstance(config, DB_PATH);
    const total = activeInstance.getMessageCount();

    if (total === 0) {
        activeInstance.close();
        activeInstance = null;
        return { success: false, error: "No messages in database to delete." };
    }

    try {
        await activeInstance.handleDeleteMode((deleted, result) => {
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

ipcMain.handle("status:get", () => {
    const config = loadConfig();
    let messageCount = 0;
    try {
        const instance = createInstance(config || { channelId: "0", authToken: "" }, DB_PATH);
        messageCount = instance.getMessageCount();
        instance.close();
    } catch {}
    return { config, messageCount };
});

ipcMain.handle("operation:cancel", () => {
    if (activeInstance) {
        activeInstance.cancel();
    }
    return { success: true };
});
