const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const BotManager = require('./src/botManager');
const { checkProxyIp } = require('./src/proxy');

let mainWindow;
let botManager;

// Plain JSON file in userData rather than renderer localStorage - simpler to debug
// and independent of how the page happens to be loaded (dev vs packaged).
const STORE_PATH = path.join(app.getPath('userData'), 'store.json');

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveStore(data) {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 950,
    minHeight: 620,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#1b1d23',
    icon: path.join(__dirname, 'build-assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:state', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:state', { maximized: false }));

  botManager = new BotManager((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  botManager.disconnectAll();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('bot:connect', async (event, slotId, config) => {
  await botManager.connect(slotId, config);
});

ipcMain.handle('bot:disconnect', (event, slotId) => {
  botManager.disconnect(slotId);
});

ipcMain.handle('bot:sendChat', (event, slotId, message) => {
  return botManager.sendChat(slotId, message);
});

ipcMain.handle('bot:sendChatAll', (event, message) => {
  return botManager.sendChatToAll(message);
});

ipcMain.handle('bot:ping', (event, host, port) => {
  return botManager.pingServer(host, port);
});

ipcMain.handle('bot:startConvoy', (event, leaderUsername) => {
  return botManager.startConvoy(leaderUsername);
});

ipcMain.handle('bot:stopConvoy', () => {
  botManager.stopConvoy();
});

ipcMain.handle('proxy:check', (event, proxy) => {
  return checkProxyIp(proxy);
});

ipcMain.handle('shell:openExternal', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('store:load', () => {
  return loadStore();
});

ipcMain.handle('store:save', (event, data) => {
  saveStore(data);
});

ipcMain.handle('win:minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('win:maximizeToggle', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('win:close', () => {
  mainWindow.close();
});
