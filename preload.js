const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connect: (slotId, config) => ipcRenderer.invoke('bot:connect', slotId, config),
  disconnect: (slotId) => ipcRenderer.invoke('bot:disconnect', slotId),
  sendChat: (slotId, message) => ipcRenderer.invoke('bot:sendChat', slotId, message),
  sendChatAll: (message) => ipcRenderer.invoke('bot:sendChatAll', message),
  pingServer: (host, port) => ipcRenderer.invoke('bot:ping', host, port),
  checkProxy: (proxy) => ipcRenderer.invoke('proxy:check', proxy),
  startConvoy: (leaderUsername) => ipcRenderer.invoke('bot:startConvoy', leaderUsername),
  stopConvoy: () => ipcRenderer.invoke('bot:stopConvoy'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (data) => ipcRenderer.invoke('store:save', data),
  onStatus: (callback) => ipcRenderer.on('bot:status', (event, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('bot:log', (event, data) => callback(data)),
  onMsaCode: (callback) => ipcRenderer.on('bot:msaCode', (event, data) => callback(data)),

  minimizeWindow: () => ipcRenderer.invoke('win:minimize'),
  maximizeToggleWindow: () => ipcRenderer.invoke('win:maximizeToggle'),
  closeWindow: () => ipcRenderer.invoke('win:close'),
  onWindowState: (callback) => ipcRenderer.on('win:state', (event, data) => callback(data))
});
