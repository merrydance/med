const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createFileAccessGuard
} = require('../../src-main/fileAccess.js');

function withTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yunwu-file-access-test-'));
}

test('allows reading a supported document only after it was selected by dialog', () => {
  const dir = withTempDir();
  const filePath = path.join(dir, 'paper.pdf');
  fs.writeFileSync(filePath, 'fake pdf');

  const guard = createFileAccessGuard();

  assert.throws(() => guard.assertReadableSelectedFile(filePath), /未通过文件选择器授权/);

  guard.registerSelectedFiles([filePath]);
  assert.equal(guard.assertReadableSelectedFile(filePath), path.resolve(filePath));
});

test('rejects unsupported extensions before document parsing', () => {
  const dir = withTempDir();
  const filePath = path.join(dir, 'script.js');
  fs.writeFileSync(filePath, 'console.log("nope")');

  const guard = createFileAccessGuard();
  guard.registerSelectedFiles([filePath]);

  assert.throws(() => guard.assertReadableSelectedFile(filePath), /仅支持 PDF、TXT、MD/);
});

test('rejects selected files above the configured size limit', () => {
  const dir = withTempDir();
  const filePath = path.join(dir, 'huge.pdf');
  fs.writeFileSync(filePath, '12345678901');

  const guard = createFileAccessGuard({ maxBytes: 10 });
  guard.registerSelectedFiles([filePath]);

  assert.throws(() => guard.assertReadableSelectedFile(filePath), /文件过大/);
});
