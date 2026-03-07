const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bulkord", {
    loadConfig: () => ipcRenderer.invoke("config:load"),
    saveConfig: (config) => ipcRenderer.invoke("config:save", config),
    startSearch: () => ipcRenderer.invoke("search:start"),
    startDelete: () => ipcRenderer.invoke("delete:start"),
    getStatus: () => ipcRenderer.invoke("status:get"),
    cancelOperation: () => ipcRenderer.invoke("operation:cancel"),

    selectExtractFolder: () => ipcRenderer.invoke("extract:select-folder"),
    startExtract: (path) => ipcRenderer.invoke("extract:start", path),

    onSearchProgress: (callback) => {
        ipcRenderer.removeAllListeners("search:progress");
        ipcRenderer.on("search:progress", (_event, data) => callback(data));
    },
    onDeleteProgress: (callback) => {
        ipcRenderer.removeAllListeners("delete:progress");
        ipcRenderer.on("delete:progress", (_event, data) => callback(data));
    },
    onExtractProgress: (callback) => {
        ipcRenderer.removeAllListeners("extract:progress");
        ipcRenderer.on("extract:progress", (_event, data) => callback(data));
    },
});
