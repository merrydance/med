const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  // 对话
  listChats: () => ipcRenderer.invoke('chats:list'),
  saveChats: (c) => ipcRenderer.invoke('chats:save', c),
  // 文件
  openFileDialog: () => ipcRenderer.invoke('file:dialog'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
});
