const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const JSONbig = require("json-bigint")({ useNativeBigInt: true });
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

ipcMain.handle("data:clear-config", () => {
    try {
        if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle("data:clear-db", () => {
    try {
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle("extract:select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select Discord Data Package Messages Folder",
        properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle("extract:start", async (_event, packagePath) => {
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);

    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS messages (
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            PRIMARY KEY (channel_id, message_id)
        );
    `);

    const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO messages (channel_id, message_id) VALUES (?, ?)"
    );
    const insertTx = db.transaction(rows => {
        for (const [c, m] of rows) insertStmt.run(c, m);
    });

    try {
        const folders = fs.readdirSync(packagePath).filter(f => f.startsWith("c"));
        if (folders.length === 0) {
            db.close();
            return { success: false, error: "No channel folders found. Make sure you selected the Messages folder from your Discord data package." };
        }

        let total = 0;
        for (let i = 0; i < folders.length; i++) {
            const folder = folders[i];
            const channelFile = path.join(packagePath, folder, "channel.json");
            const messagesFile = path.join(packagePath, folder, "messages.json");

            if (!fs.existsSync(channelFile) || !fs.existsSync(messagesFile)) continue;

            const channelId = JSON.parse(fs.readFileSync(channelFile, "utf-8")).id;
            const messages = JSONbig.parse(fs.readFileSync(messagesFile, "utf-8"))
                .map(message => [channelId, String(message.ID)]);

            if (messages.length === 0) continue;

            insertTx(messages);
            total += messages.length;

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("extract:progress", {
                    current: i + 1,
                    totalFolders: folders.length,
                    messagesExtracted: total,
                });
            }
        }

        db.close();
        return { success: true, messages: total, channels: folders.length };
    } catch (err) {
        db.close();
        return { success: false, error: err.message };
    }
});
