const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../../src-main/db.js');

function withTempUserData() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'yunwu-db-test-'));
  fs.mkdirSync(path.join(userDataPath, 'data'), { recursive: true });
  return userDataPath;
}

test.afterEach(() => {
  db.closeDatabase();
});

test('creates chats and messages, then cascades delete to messages', () => {
  const userDataPath = withTempUserData();
  db.initDatabase(userDataPath);

  db.createChat({
    id: 'chat-1',
    title: '病例讨论',
    model: 'gpt-4o',
    reasoningEffort: 'high',
    createdAt: 1000,
    updatedAt: 1000
  });
  db.insertMessage({
    id: 'msg-1',
    chatId: 'chat-1',
    role: 'user',
    content: '症状？',
    createdAt: 1001
  });
  db.insertMessage({
    id: 'msg-2',
    chatId: 'chat-1',
    role: 'assistant',
    content: '建议补充影像资料。',
    createdAt: 1002
  });

  assert.deepEqual(db.getChats(), [{
    id: 'chat-1',
    title: '病例讨论',
    model: 'gpt-4o',
    reasoningEffort: 'high',
    createdAt: 1000,
    updatedAt: 1000
  }]);
  assert.equal(db.getMessagesByChatId('chat-1').length, 2);

  db.deleteChat('chat-1');

  assert.deepEqual(db.getChats(), []);
  assert.deepEqual(db.getMessagesByChatId('chat-1'), []);
});

test('migrates legacy chats.json with ISO timestamps and creates a backup', () => {
  const userDataPath = withTempUserData();
  const legacyFile = path.join(userDataPath, 'data', 'chats.json');
  fs.writeFileSync(legacyFile, JSON.stringify([{
    id: 'legacy-1',
    title: '旧会话',
    createdAt: '2026-05-09T12:00:00.000Z',
    updatedAt: '2026-05-09T12:30:00.000Z',
    messages: [{
      id: 'legacy-msg-1',
      role: 'user',
      content: '旧问题',
      createdAt: '2026-05-09T12:01:00.000Z'
    }]
  }]));

  db.initDatabase(userDataPath);
  db.migrateFromJSON(userDataPath);

  assert.deepEqual(db.getChats(), [{
    id: 'legacy-1',
    title: '旧会话',
    model: 'gpt-5.5',
    reasoningEffort: '',
    createdAt: Date.parse('2026-05-09T12:00:00.000Z'),
    updatedAt: Date.parse('2026-05-09T12:30:00.000Z')
  }]);
  assert.deepEqual(db.getMessagesByChatId('legacy-1'), [{
    id: 'legacy-msg-1',
    chatId: 'legacy-1',
    role: 'user',
    content: '旧问题',
    createdAt: Date.parse('2026-05-09T12:01:00.000Z')
  }]);
  assert.equal(fs.existsSync(legacyFile), false);
  assert.equal(fs.existsSync(`${legacyFile}.bak`), true);
});

test('updates chat model and reasoning effort independently of messages', () => {
  const userDataPath = withTempUserData();
  db.initDatabase(userDataPath);

  db.createChat({
    id: 'chat-model',
    title: '模型测试',
    model: 'gpt-4o-mini',
    reasoningEffort: '',
    createdAt: 2000,
    updatedAt: 2000
  });

  db.updateChatModelConfig('chat-model', {
    model: 'gpt-5.5',
    reasoningEffort: 'medium'
  });

  assert.deepEqual(db.getChats(), [{
    id: 'chat-model',
    title: '模型测试',
    model: 'gpt-5.5',
    reasoningEffort: 'medium',
    createdAt: 2000,
    updatedAt: 2000
  }]);
});
