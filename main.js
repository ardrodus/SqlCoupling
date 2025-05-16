// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Optional: electron-reloader for development
try {
    require('electron-reloader')(module);
} catch (_) {}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // Recommended for security
            nodeIntegration: false, // Recommended for security
        },
    });

    // Load the Angular app
    // Ensure Angular is built with --base-href ./
    win.loadFile(path.join(__dirname, 'dist/sql-dependency-analyzer/index.html')); // Adjusted for Angular 15 output

    // Open DevTools (optional)
    // win.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) {
        return null;
    }
    return filePaths[0];
});

function getRelativePath(basePath, filePath) {
    // Normalize paths and make them relative
    // Ensure consistent path separators (e.g., always /)
    let relative = path.relative(basePath, filePath);
    if (os.platform() === 'win32') {
        relative = relative.replace(/\\/g, '/');
    }
    return relative;
}

ipcMain.handle('fs:readDirectory', async (event, dirPath) => {
    const filesData = [];
    const errors = [];

    function scanDirectory(currentPath) {
        try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        filesData.push({
                            path: getRelativePath(dirPath, fullPath), // Relative path
                            content: content
                        });
                    } catch (readError) {
                        console.error(`Error reading file ${fullPath}:`, readError);
                        errors.push(`Error reading file ${fullPath}: ${readError.message}`);
                    }
                }
            }
        } catch (dirError) {
            console.error(`Error reading directory ${currentPath}:`, dirError);
            errors.push(`Error reading directory ${currentPath}: ${dirError.message}`);
        }
    }

    if (dirPath) {
        scanDirectory(dirPath);
    }
    return { filesData, errors };
});