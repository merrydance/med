const fs = require('fs');
const path = require('path');

const DEFAULT_ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.markdown']);
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

function createFileAccessGuard(options = {}) {
  const selectedFiles = new Set();
  const allowedExtensions = new Set(options.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS);
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;

  function normalizePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('文件路径无效');
    }
    return path.resolve(filePath);
  }

  function registerSelectedFiles(filePaths = []) {
    for (const filePath of filePaths) {
      selectedFiles.add(normalizePath(filePath));
    }
  }

  function assertReadableSelectedFile(filePath) {
    const resolvedPath = normalizePath(filePath);

    if (!selectedFiles.has(resolvedPath)) {
      throw new Error('未通过文件选择器授权，已拒绝读取该文件。');
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error('仅支持 PDF、TXT、MD 文档。');
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('请选择有效文件。');
    }
    if (stat.size > maxBytes) {
      throw new Error(`文件过大，当前限制为 ${Math.round(maxBytes / 1024 / 1024)}MB。`);
    }

    return resolvedPath;
  }

  return {
    registerSelectedFiles,
    assertReadableSelectedFile
  };
}

module.exports = {
  createFileAccessGuard
};
