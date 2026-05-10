const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');

test('does not disable TLS certificate validation in production by default', () => {
  const mainSource = fs.readFileSync(path.join(rootDir, 'main.js'), 'utf8');

  assert.match(mainSource, /YUNWU_ALLOW_INSECURE_TLS/);
  assert.match(mainSource, /isDevMode\(\) && process\.env\.YUNWU_ALLOW_INSECURE_TLS === '1'/);
  assert.doesNotMatch(mainSource, /if\s*\(\s*process\.platform\s*===\s*'linux'\s*\)\s*{\s*app\.commandLine\.appendSwitch\('ignore-certificate-errors'\)/);
});
