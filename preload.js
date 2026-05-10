const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  testConnection: () => ipcRenderer.invoke('settings:testConnection'),

  // 文件系统
  openFileDialog: () => ipcRenderer.invoke('file:dialog'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),

  // 数据库 CRUD (Task 3.1.3)
  dbGetChats: () => ipcRenderer.invoke('db:getChats'),
  dbGetMessages: (chatId) => ipcRenderer.invoke('db:getMessages', chatId),
  dbCreateChat: (chat) => ipcRenderer.invoke('db:createChat', chat),
  dbInsertMessage: (msg) => ipcRenderer.invoke('db:insertMessage', msg),
  dbUpdateChatTitle: (chatId, title) => ipcRenderer.invoke('db:updateChatTitle', chatId, title),
  dbUpdateChatModelConfig: (chatId, config) => ipcRenderer.invoke('db:updateChatModelConfig', chatId, config),
  dbTouchChat: (chatId) => ipcRenderer.invoke('db:touchChat', chatId),
  dbDeleteChat: (chatId) => ipcRenderer.invoke('db:deleteChat', chatId),

  // 大模型网络请求 (将在 Task 2.1.2 使用)
  chat: (params) => ipcRenderer.invoke('api:chat', params),
  onChatDelta: (callback) => {
    // 移除之前的监听器防止重复绑定
    ipcRenderer.removeAllListeners('chat:delta');
    ipcRenderer.on('chat:delta', (event, chunk) => callback(chunk));
  },
  onChatComplete: (callback) => {
    ipcRenderer.removeAllListeners('chat:complete');
    ipcRenderer.on('chat:complete', () => callback());
  },
  onChatError: (callback) => {
    ipcRenderer.removeAllListeners('chat:error');
    ipcRenderer.on('chat:error', (event, errorMsg) => callback(errorMsg));
  },

  // 联网搜索 (将在 Task 2.1.3 使用)
  searchTavily: (query) => ipcRenderer.invoke('api:searchTavily', query)
});
