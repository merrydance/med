const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_SETTINGS,
  readSettings,
  writeSettings
} = require('../../src-main/settings.js');

function withTempUserData() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'yunwu-settings-test-'));
  fs.mkdirSync(path.join(userDataPath, 'data'), { recursive: true });
  return userDataPath;
}

test('reads default settings when settings.json is missing or invalid', () => {
  const userDataPath = withTempUserData();

  assert.deepEqual(readSettings(userDataPath), DEFAULT_SETTINGS);

  fs.writeFileSync(path.join(userDataPath, 'data', 'settings.json'), '{broken json');
  assert.deepEqual(readSettings(userDataPath), DEFAULT_SETTINGS);
});

test('writes settings atomically with normalized string fields', () => {
  const userDataPath = withTempUserData();

  assert.equal(writeSettings(userDataPath, {
    baseUrl: ' https://api.openai.com/v1/ ',
    apiKey: ' sk-test ',
    tavilyKey: ' tvly-test ',
    model: 'gpt-4o',
    customModel: ' custom-model ',
    reasoningEffort: 'high',
    theme: 'dark',
    ignored: 'field'
  }), true);

  assert.deepEqual(readSettings(userDataPath), {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    tavilyKey: 'tvly-test',
    model: 'gpt-4o',
    customModel: 'custom-model',
    reasoningEffort: 'high',
    theme: 'dark'
  });
});

test('protects API keys at rest while returning plaintext settings to the app', () => {
  const userDataPath = withTempUserData();
  const settingsFile = path.join(userDataPath, 'data', 'settings.json');

  assert.equal(writeSettings(userDataPath, {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-live-secret',
    tavilyKey: 'tvly-live-secret',
    model: 'gpt-5.5',
    theme: 'system'
  }), true);

  const rawSettings = fs.readFileSync(settingsFile, 'utf-8');
  assert.doesNotMatch(rawSettings, /sk-live-secret/);
  assert.doesNotMatch(rawSettings, /tvly-live-secret/);
  assert.match(rawSettings, /protected/);

  assert.deepEqual(readSettings(userDataPath), {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-live-secret',
    tavilyKey: 'tvly-live-secret',
    model: 'gpt-5.5',
    customModel: '',
    reasoningEffort: '',
    theme: 'system'
  });
});

test('reads legacy plaintext API keys so existing installations can migrate on next save', () => {
  const userDataPath = withTempUserData();
  const settingsFile = path.join(userDataPath, 'data', 'settings.json');

  fs.writeFileSync(settingsFile, JSON.stringify({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'legacy-api-key',
    tavilyKey: 'legacy-tavily-key',
    model: 'gpt-4o',
    theme: 'dark'
  }, null, 2));

  assert.deepEqual(readSettings(userDataPath), {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'legacy-api-key',
    tavilyKey: 'legacy-tavily-key',
    model: 'gpt-4o',
    customModel: '',
    reasoningEffort: '',
    theme: 'dark'
  });

  assert.equal(writeSettings(userDataPath, readSettings(userDataPath)), true);
  const rawSettings = fs.readFileSync(settingsFile, 'utf-8');
  assert.doesNotMatch(rawSettings, /legacy-api-key/);
  assert.doesNotMatch(rawSettings, /legacy-tavily-key/);
});
