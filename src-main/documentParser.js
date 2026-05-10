const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const DEFAULT_DOCLING_TIMEOUT_MS = Number(process.env.YUNWU_DOCLING_TIMEOUT_MS || 30000);

function stripMarkdownForSearch(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return '';
      if (trimmed.includes('|')) {
        return trimmed
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
          .join(' ');
      }
      return trimmed
        .replace(/^#{1,6}\s+/g, '')
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/^\s*[-+*]\s+/g, '')
        .replace(/^\s*\d+\.\s+/g, '');
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createDoclingUnavailableMessage(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (error?.code === 'ENOENT' || message.includes('not found') || message.includes('enoent')) {
    return '未检测到 Docling，已自动使用兼容解析。';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'Docling 解析未完成，已自动使用兼容解析。';
  }
  return '高级解析失败，已自动使用兼容解析。';
}

function findMarkdownFile(outputDir, sourceFilePath) {
  const baseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
  const candidates = [
    path.join(outputDir, `${baseName}.md`),
    path.join(outputDir, `${baseName}.markdown`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const markdownFiles = fs.readdirSync(outputDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.md') || fileName.toLowerCase().endsWith('.markdown'))
    .map((fileName) => path.join(outputDir, fileName));

  return markdownFiles[0] || null;
}

function buildDoclingArgs(filePath, outputDir, timeoutMs = DEFAULT_DOCLING_TIMEOUT_MS) {
  return [
    '--pipeline', 'standard',
    '--no-ocr',
    '--tables',
    '--table-mode', 'accurate',
    '--to', 'md',
    '--output', outputDir,
    '--document-timeout', String(Math.ceil(timeoutMs / 1000)),
    filePath
  ];
}

async function runDoclingCli(filePath, options = {}) {
  const timeout = options.timeoutMs || DEFAULT_DOCLING_TIMEOUT_MS;
  const tempRoot = options.tempRoot || os.tmpdir();
  const outputDir = fs.mkdtempSync(path.join(tempRoot, 'yunwu-docling-'));

  try {
    await execFileAsync(
      options.command || 'docling',
      buildDoclingArgs(filePath, outputDir, timeout),
      {
        timeout,
        maxBuffer: 1024 * 1024 * 20,
        windowsHide: true
      }
    );

    const markdownPath = findMarkdownFile(outputDir, filePath);
    if (!markdownPath) throw new Error('Docling 未生成 Markdown 文件');
    return fs.readFileSync(markdownPath, 'utf-8');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

async function parsePdfWithFallback(filePath, deps) {
  const warnings = [];
  const runDocling = deps.runDocling || runDoclingCli;
  const readFile = deps.readFile || fs.readFileSync;
  const pdfParse = deps.pdfParse || require('pdf-parse');

  try {
    const markdown = await runDocling(filePath);
    const text = stripMarkdownForSearch(markdown);
    return {
      name: path.basename(filePath),
      text,
      markdown,
      pages: 1,
      provider: 'docling',
      fallbackFrom: null,
      warnings
    };
  } catch (doclingError) {
    warnings.push(createDoclingUnavailableMessage(doclingError));

    try {
      const buffer = readFile(filePath);
      const data = await pdfParse(buffer);
      const text = data.text || '';
      return {
        name: path.basename(filePath),
        text,
        markdown: '',
        pages: data.numpages || 1,
        provider: 'pdf-parse',
        fallbackFrom: 'docling',
        warnings
      };
    } catch (fallbackError) {
      throw new Error(`高级解析失败: ${doclingError.message}; 兼容解析也失败: ${fallbackError.message}`);
    }
  }
}

async function parseDocument(filePath, deps = {}) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return parsePdfWithFallback(filePath, deps);
  }

  const readTextFile = deps.readTextFile || fs.readFileSync;
  const text = readTextFile(filePath, 'utf-8');
  return {
    name: path.basename(filePath),
    text,
    markdown: ext === '.md' || ext === '.markdown' ? text : '',
    pages: 1,
    provider: 'plain-text',
    fallbackFrom: null,
    warnings: []
  };
}

module.exports = {
  parseDocument,
  runDoclingCli,
  buildDoclingArgs,
  stripMarkdownForSearch,
  createDoclingUnavailableMessage
};
