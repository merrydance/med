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
