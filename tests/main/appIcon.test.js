const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const packageJson = require('../../package.json');

test('electron builder and runtime use the application-owned icon assets', () => {
  assert.equal(packageJson.build.win.icon, 'assets/icon.ico');
  assert.ok(fs.existsSync(path.join(rootDir, 'assets', 'icon.svg')));
  assert.ok(fs.existsSync(path.join(rootDir, 'assets', 'icon.png')));
  assert.ok(fs.existsSync(path.join(rootDir, 'assets', 'icon.ico')));

  const mainSource = fs.readFileSync(path.join(rootDir, 'main.js'), 'utf8');
  assert.match(mainSource, /path\.join\(__dirname,\s*'assets',\s*'icon\.png'\)/);

  const htmlSource = fs.readFileSync(path.join(rootDir, 'frontend', 'index.html'), 'utf8');
  assert.match(htmlSource, /href="\/icon\.svg"/);
});
