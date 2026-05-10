/**
 * SQLite 数据库模块 (Task 3.1.1 ~ 3.1.3)
 * 
 * 职责：
 *   - 初始化数据库与表结构
 *   - 从旧版 chats.json 迁移数据
 *   - 提供 CRUD 接口供 IPC 调用
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DEFAULT_CHAT_MODEL = 'gpt-5.5';

let db = null;

// ====== 初始化 ======

function initDatabase(userDataPath) {
  const dataDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'neuro_data.db');
  db = new Database(dbPath);

  // 开启 WAL 模式，提高并发读写性能
  db.pragma('journal_mode = WAL');
  // 开启外键约束
  db.pragma('foreign_keys = ON');

  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '新对话',
      model      TEXT NOT NULL DEFAULT '${DEFAULT_CHAT_MODEL}',
      reasoning_effort TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      chat_id    TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content    TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
  `);

  migrateChatConfigColumns();

  console.log('[DB] SQLite 数据库初始化完成:', dbPath);
  return db;
}

function migrateChatConfigColumns() {
  const columns = db.prepare('PRAGMA table_info(chats)').all().map((column) => column.name);
  if (!columns.includes('model')) {
    db.exec(`ALTER TABLE chats ADD COLUMN model TEXT NOT NULL DEFAULT '${DEFAULT_CHAT_MODEL}'`);
  }
  if (!columns.includes('reasoning_effort')) {
    db.exec("ALTER TABLE chats ADD COLUMN reasoning_effort TEXT NOT NULL DEFAULT ''");
  }
}

function closeDatabase() {
  if (!db) return;
  db.close();
  db = null;
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

// ====== JSON 迁移 (Task 3.1.2) ======

function migrateFromJSON(userDataPath) {
  const jsonFile = path.join(userDataPath, 'data', 'chats.json');
  if (!fs.existsSync(jsonFile)) return;

  // 仅在数据库为空时迁移
  const count = db.prepare('SELECT COUNT(*) as cnt FROM chats').get();
  if (count.cnt > 0) return;

  console.log('[DB] 发现旧版 chats.json，开始数据迁移...');

  let chats;
  try {
    chats = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
  } catch (e) {
    console.error('[DB] chats.json 解析失败，跳过迁移:', e.message);
    return;
  }

  if (!Array.isArray(chats) || chats.length === 0) return;

  const insertChat = db.prepare(`
    INSERT OR IGNORE INTO chats (id, title, model, reasoning_effort, created_at, updated_at)
    VALUES (@id, @title, @model, @reasoningEffort, @createdAt, @updatedAt)
  `);

  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (id, chat_id, role, content, created_at)
    VALUES (@id, @chatId, @role, @content, @createdAt)
  `);

  const migrateAll = db.transaction(() => {
    for (const chat of chats) {
      insertChat.run({
        id: chat.id,
        title: chat.title || '新对话',
        model: chat.model || DEFAULT_CHAT_MODEL,
        reasoningEffort: chat.reasoningEffort || '',
        createdAt: normalizeTimestamp(chat.createdAt),
        updatedAt: normalizeTimestamp(chat.updatedAt)
      });

      if (Array.isArray(chat.messages)) {
        for (const msg of chat.messages) {
          insertMessage.run({
            id: msg.id || Math.random().toString(36).substring(2, 15),
            chatId: chat.id,
            role: msg.role || 'user',
            content: msg.content || '',
            createdAt: normalizeTimestamp(msg.createdAt)
          });
        }
      }
    }
  });

  migrateAll();

  // 备份旧文件
  const backupFile = jsonFile + '.bak';
  fs.renameSync(jsonFile, backupFile);
  console.log(`[DB] 迁移完成：${chats.length} 个会话已写入 SQLite，旧文件已备份为 chats.json.bak`);
}

// ====== CRUD 接口 (Task 3.1.3) ======

function getChats() {
  return db.prepare(`
    SELECT
      id,
      title,
      model,
      reasoning_effort AS reasoningEffort,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM chats
    ORDER BY updated_at DESC
  `).all();
}

function getMessagesByChatId(chatId) {
  return db.prepare('SELECT id, chat_id AS chatId, role, content, created_at AS createdAt FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
}

function createChat(chat) {
  db.prepare(`
    INSERT INTO chats (id, title, model, reasoning_effort, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    chat.id,
    chat.title,
    chat.model || DEFAULT_CHAT_MODEL,
    chat.reasoningEffort || '',
    chat.createdAt,
    chat.updatedAt
  );
  return {
    ...chat,
    model: chat.model || DEFAULT_CHAT_MODEL,
    reasoningEffort: chat.reasoningEffort || ''
  };
}

function insertMessage(msg) {
  db.prepare('INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    msg.id, msg.chatId, msg.role, msg.content, msg.createdAt
  );
  return msg;
}

function updateChatTitle(chatId, title) {
  db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), chatId);
}

function updateChatModelConfig(chatId, config) {
  db.prepare('UPDATE chats SET model = ?, reasoning_effort = ? WHERE id = ?').run(
    config.model || DEFAULT_CHAT_MODEL,
    config.reasoningEffort || '',
    chatId
  );
}

function touchChatUpdatedAt(chatId) {
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), chatId);
}

function deleteChat(chatId) {
  // messages 会因 ON DELETE CASCADE 自动清除
  db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
}

module.exports = {
  initDatabase,
  closeDatabase,
  migrateFromJSON,
  getChats,
  getMessagesByChatId,
  createChat,
  insertMessage,
  updateChatTitle,
  updateChatModelConfig,
  touchChatUpdatedAt,
  deleteChat,
  DEFAULT_CHAT_MODEL
};
