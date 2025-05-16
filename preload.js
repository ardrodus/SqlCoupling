// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
    readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath)
});