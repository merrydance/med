const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  baseUrl: '',
  apiKey: '',
  tavilyKey: '',
  model: 'gpt-5.5',
  customModel: '',
  reasoningEffort: '',
  theme: 'system'
};

const SECRET_FIELDS = ['apiKey', 'tavilyKey'];
const LOCAL_PROTECTION_SCHEME = 'local-aes-256-gcm-v1';
const ELECTRON_PROTECTION_SCHEME = 'electron-safe-storage-v1';

function getSettingsFile(userDataPath) {
  return path.join(userDataPath, 'data', 'settings.json');
}

function getLocalKey() {
  let username = 'unknown-user';
  try {
    username = os.userInfo().username || username;
  } catch {
    // Some service contexts do not expose userInfo; keep a stable fallback.
  }

  return crypto.scryptSync(
    [
      'yunwu-settings',
      process.platform,
      os.hostname(),
      username
    ].join('|'),
    'yunwu-local-secret-protection-v1',
    32
  );
}

function protectWithLocalCrypto(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getLocalKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf-8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    protected: true,
    scheme: LOCAL_PROTECTION_SCHEME,
    value: Buffer.concat([iv, tag, encrypted]).toString('base64')
  };
}

function unprotectWithLocalCrypto(value) {
  const payload = Buffer.from(String(value || ''), 'base64');
  if (payload.length <= 28) return '';
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getLocalKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf-8');
}

function createSafeStorageProvider(safeStorage) {
  return {
    scheme: ELECTRON_PROTECTION_SCHEME,
    isAvailable() {
      return Boolean(safeStorage?.isEncryptionAvailable?.());
    },
    protect(value) {
      return {
        protected: true,
        scheme: ELECTRON_PROTECTION_SCHEME,
        value: safeStorage.encryptString(value).toString('base64')
      };
    },
    unprotect(value) {
      return safeStorage.decryptString(Buffer.from(String(value || ''), 'base64'));
    }
  };
}

function getActiveCryptoProvider(options = {}) {
  const provider = options.cryptoProvider;
  if (provider?.scheme && provider?.isAvailable?.()) return provider;
  return {
    scheme: LOCAL_PROTECTION_SCHEME,
    isAvailable: () => true,
    protect: protectWithLocalCrypto,
    unprotect: unprotectWithLocalCrypto
  };
}

function protectSecret(value, options = {}) {
  const secret = String(value || '').trim();
  if (!secret) return '';
  return getActiveCryptoProvider(options).protect(secret);
}

function unprotectSecret(value, options = {}) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object' || value.protected !== true) return '';

  try {
    if (value.scheme === LOCAL_PROTECTION_SCHEME) {
      return unprotectWithLocalCrypto(value.value).trim();
    }
    const provider = options.cryptoProvider;
    if (provider?.scheme === value.scheme && provider?.isAvailable?.()) {
      return String(provider.unprotect(value.value) || '').trim();
    }
  } catch {
    return '';
  }

  return '';
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

function normalizeStoredSettings(settings = {}, options = {}) {
  return normalizeSettings({
    ...settings,
    apiKey: unprotectSecret(settings.apiKey, options),
    tavilyKey: unprotectSecret(settings.tavilyKey, options)
  });
}

function serializeSettingsForStorage(settings = {}, options = {}) {
  const normalized = normalizeSettings(settings);
  return {
    ...normalized,
    ...Object.fromEntries(SECRET_FIELDS.map((field) => [
      field,
      protectSecret(normalized[field], options)
    ]))
  };
}

function readSettings(userDataPath, options = {}) {
  const file = getSettingsFile(userDataPath);
  if (!fs.existsSync(file)) return { ...DEFAULT_SETTINGS };

  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return normalizeStoredSettings({ ...DEFAULT_SETTINGS, ...saved }, options);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(userDataPath, settings, options = {}) {
  const dataDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const file = getSettingsFile(userDataPath);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(serializeSettingsForStorage(settings, options), null, 2));
  fs.renameSync(tmp, file);
  return true;
}

module.exports = {
  DEFAULT_SETTINGS,
  createSafeStorageProvider,
  normalizeSettings,
  readSettings,
  writeSettings
};
