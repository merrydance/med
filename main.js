const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Linux 下 NSS 证书兼容 (Windows 无需此项)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

// 数据存储目录
const dataDir = path.join(app.getPath('userData'), 'data');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '神经外科 AI 科研助手',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  ensureDataDir();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ====== IPC 处理 ======

// 保存/读取设置
ipcMain.handle('settings:get', () => {
  const file = path.join(dataDir, 'settings.json');
  const defaults = { baseUrl: '', apiKey: '', tavilyKey: '', model: 'gpt-5.5', customModel: '', reasoningEffort: 'high' };
  if (fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return { ...defaults, ...saved }; // 合并默认值，兼容旧版缺字段
    } catch { return defaults; } // JSON 损坏则返回默认
  }
  return defaults;
});

ipcMain.handle('settings:save', (_, settings) => {
  try {
    const file = path.join(dataDir, 'settings.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error('保存设置失败:', err);
    return false;
  }
});

// 对话存储
ipcMain.handle('chats:list', () => {
  const file = path.join(dataDir, 'chats.json');
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { return []; } // JSON 损坏则返回空
  }
  return [];
});

ipcMain.handle('chats:save', (_, chats) => {
  try {
    // 先写临时文件再重命名，防止写入中途崩溃导致数据丢失
    const file = path.join(dataDir, 'chats.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(chats, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error('保存对话失败:', err);
    return false;
  }
});

// 读取文件
ipcMain.handle('file:read', async (_, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return { name: path.basename(filePath), text: data.text || '', pages: data.numpages || 1 };
    }
    const text = fs.readFileSync(filePath, 'utf-8');
    return { name: path.basename(filePath), text, pages: 1 };
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
