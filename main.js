const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./src-main/db.js');
const settingsStore = require('./src-main/settings.js');
const { parseDocument } = require('./src-main/documentParser.js');
const {
  normalizeChatBaseUrl,
  createChatRequestBody,
  extractSseDeltas,
  testChatConnection
} = require('./src-main/api.js');
const { buildDocumentContext } = require('./src-main/rag.js');

const APP_TITLE = '神经外科 AI 科研助手';

// Linux 下 NSS 证书兼容 (Windows 无需此项)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

// 数据存储目录
const dataDir = path.join(app.getPath('userData'), 'data');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function hideDefaultMenu() {
  Menu.setApplicationMenu(null);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_TITLE,
    icon: path.join(__dirname, 'icon.png'),
    frame: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(APP_TITLE);
  });

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist-frontend', 'index.html'));
  }
}

app.whenReady().then(() => {
  hideDefaultMenu();
  ensureDataDir();
  db.initDatabase(app.getPath('userData'));
  db.migrateFromJSON(app.getPath('userData'));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ====== IPC 处理 ======

// 保存/读取设置
ipcMain.handle('settings:get', () => {
  return settingsStore.readSettings(app.getPath('userData'));
});

ipcMain.handle('settings:save', (_, settings) => {
  try {
    return settingsStore.writeSettings(app.getPath('userData'), settings);
  } catch (err) {
    console.error('保存设置失败:', err);
    return false;
  }
});

// ====== SQLite CRUD (Task 3.1.3) ======

ipcMain.handle('db:getChats', () => {
  return db.getChats();
});

ipcMain.handle('db:getMessages', (_, chatId) => {
  return db.getMessagesByChatId(chatId);
});

ipcMain.handle('db:createChat', (_, chat) => {
  return db.createChat(chat);
});

ipcMain.handle('db:insertMessage', (_, msg) => {
  return db.insertMessage(msg);
});

ipcMain.handle('db:updateChatTitle', (_, chatId, title) => {
  db.updateChatTitle(chatId, title);
});

ipcMain.handle('db:updateChatModelConfig', (_, chatId, config) => {
  db.updateChatModelConfig(chatId, config);
});

ipcMain.handle('db:touchChat', (_, chatId) => {
  db.touchChatUpdatedAt(chatId);
});

ipcMain.handle('db:deleteChat', (_, chatId) => {
  db.deleteChat(chatId);
});

// 读取文件
ipcMain.handle('file:read', async (_, filePath) => {
  try {
    return await parseDocument(filePath);
  } catch (err) {
    throw new Error(`文件读取失败: ${err.message}`);
  }
});

// 打开文件对话框
ipcMain.handle('file:dialog', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: '文档', extensions: ['pdf', 'txt', 'md', 'doc', 'docx'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('file:dialogs', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文档', extensions: ['pdf', 'txt', 'md', 'doc', 'docx'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});

ipcMain.handle('rag:selectContext', (_, payload) => {
  return buildDocumentContext({
    name: payload?.name,
    text: payload?.text,
    query: payload?.query
  });
});

// 大模型对话请求 (Task 2.1.2)
function getSettingsSync() {
  const settings = settingsStore.readSettings(app.getPath('userData'));
  return {
    ...settings,
    baseUrl: settings.baseUrl || 'https://api.openai.com/v1'
  };
}

ipcMain.handle('settings:testConnection', async () => {
  const settings = getSettingsSync();
  return testChatConnection({ settings });
});

ipcMain.handle('api:chat', async (event, params) => {
  const settings = {
    ...getSettingsSync(),
    ...(params.settings || {})
  };
  const { messages } = params;

  if (!settings.apiKey) {
    event.sender.send('chat:error', '请先在设置中配置 API Key');
    return;
  }

  const baseUrl = normalizeChatBaseUrl(settings.baseUrl);

  try {
    const body = createChatRequestBody({ settings, messages });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      event.sender.send('chat:error', `请求失败 (${response.status}): ${errorText}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let remainder = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const parsed = extractSseDeltas(decoder.decode(value, { stream: true }), remainder);
      remainder = parsed.remainder;
      parsed.deltas.forEach((delta) => event.sender.send('chat:delta', delta));
    }

    event.sender.send('chat:complete');
  } catch (error) {
    event.sender.send('chat:error', `网络错误: ${error.message}`);
  }
});

// 搜索工具 (Task 2.1.3)
const searchModule = require('./search.js');

ipcMain.handle('api:searchTavily', async (event, query) => {
  const settings = getSettingsSync();
  try {
    const [pubmedResults, tavilyResults] = await Promise.all([
      searchModule.searchPubMed(query),
      searchModule.searchTavily(query, settings.tavilyKey, searchModule.NEURO_SEARCH_DOMAINS)
    ]);

    return searchModule.formatSearchContext(pubmedResults, tavilyResults);
  } catch (err) {
    console.error('搜索请求失败:', err);
    return null;
  }
});
