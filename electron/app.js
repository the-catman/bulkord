/**
 * Electron main process - window setup and lifecycle.
 */

const { app, BrowserWindow } = require("electron");
const path = require("path");

const { registerHandlers } = require("./ipc-handlers");

let mainWindow;
let ipcController;

// Paths (initialized after app is ready)
let CONFIG_PATH;
let DB_PATH;

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
    
    // Register IPC handlers
    ipcController = registerHandlers({
        getMainWindow: () => mainWindow,
        getConfigPath: () => CONFIG_PATH,
        getDbPath: () => DB_PATH,
        getUserDataPath: () => app.getPath("userData"),
    });
    
    createWindow();
});

app.on("window-all-closed", () => {
    if (ipcController) {
        ipcController.cancelActiveInstance();
    }
    app.quit();
});
