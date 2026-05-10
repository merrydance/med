const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  baseUrl: '',
  apiKey: '',
  tavilyKey: '',
  model: 'gpt-5.5',
  customModel: '',
  reasoningEffort: '',
  theme: 'system'
};

function getSettingsFile(userDataPath) {
  return path.join(userDataPath, 'data', 'settings.json');
}

function normalizeSettings(settings = {}) {
  return {
    baseUrl: String(settings.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(settings.apiKey || '').trim(),
    tavilyKey: String(settings.tavilyKey || '').trim(),
    model: String(settings.model || DEFAULT_SETTINGS.model).trim(),
    customModel: String(settings.customModel || '').trim(),
    reasoningEffort: String(settings.reasoningEffort || '').trim(),
    theme: ['light', 'dark', 'system'].includes(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme
  };
}

function readSettings(userDataPath) {
  const file = getSettingsFile(userDataPath);
  if (!fs.existsSync(file)) return { ...DEFAULT_SETTINGS };

  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(userDataPath, settings) {
  const dataDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const file = getSettingsFile(userDataPath);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalizeSettings(settings), null, 2));
  fs.renameSync(tmp, file);
  return true;
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  readSettings,
  writeSettings
};
