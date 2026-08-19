const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// URL do backend em produção
const NEXORA_URL = 'https://nexora-production-b6ea.up.railway.app';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'Nexora',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  win.loadURL(NEXORA_URL);

  // Links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
