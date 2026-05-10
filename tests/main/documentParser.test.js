const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  parseDocument,
  stripMarkdownForSearch,
  createDoclingUnavailableMessage,
  buildDoclingArgs
} = require('../../src-main/documentParser.js');

test('strips markdown while preserving table cell text for retrieval', () => {
  const text = stripMarkdownForSearch([
    '# 结果',
    '',
    '| 组别 | 剂量 | P值 |',
    '|---|---:|---:|',
    '| 治疗组 | 20mg | 0.03 |',
    '',
    '**结论**：有效。'
  ].join('\n'));

  assert.ok(text.includes('组别 剂量 P值'));
  assert.ok(text.includes('治疗组 20mg 0.03'));
  assert.ok(text.includes('结论：有效。'));
});

test('uses Docling markdown output for PDFs when available', async () => {
  const result = await parseDocument('/tmp/paper.pdf', {
    runDocling: async (filePath) => {
      assert.equal(filePath, '/tmp/paper.pdf');
      return '# 标题\n\n| 指标 | 数值 |\n|---|---:|\n| PFS | 12 |';
    },
    readFile: () => Buffer.from('pdf bytes'),
    pdfParse: async () => {
      throw new Error('pdf-parse should not run');
    }
  });

  assert.equal(result.provider, 'docling');
  assert.equal(result.name, 'paper.pdf');
  assert.equal(result.markdown.includes('| PFS | 12 |'), true);
  assert.equal(result.text.includes('PFS 12'), true);
  assert.deepEqual(result.warnings, []);
});

test('falls back to pdf-parse when Docling is unavailable', async () => {
  const result = await parseDocument('/tmp/fallback.pdf', {
    runDocling: async () => {
      const error = new Error('spawn docling ENOENT');
      error.code = 'ENOENT';
      throw error;
    },
    readFile: () => Buffer.from('pdf bytes'),
    pdfParse: async () => ({
      text: '兼容解析文本',
      numpages: 3
    })
  });

  assert.equal(result.provider, 'pdf-parse');
  assert.equal(result.fallbackFrom, 'docling');
  assert.equal(result.text, '兼容解析文本');
  assert.equal(result.pages, 3);
  assert.ok(result.warnings[0].includes('未检测到 Docling'));
});

test('reports both parser failures when PDF parsing cannot recover', async () => {
  await assert.rejects(
    parseDocument('/tmp/broken.pdf', {
      runDocling: async () => {
        throw new Error('docling failed');
      },
      readFile: () => Buffer.from('pdf bytes'),
      pdfParse: async () => {
        throw new Error('pdf parse failed');
      }
    }),
    /高级解析失败.*兼容解析也失败/s
  );
});

test('reads plain text documents without running Docling', async () => {
  const result = await parseDocument(path.join('/tmp', 'note.md'), {
    readTextFile: () => '术后随访重点',
    runDocling: async () => {
      throw new Error('docling should not run');
    }
  });

  assert.equal(result.provider, 'plain-text');
  assert.equal(result.text, '术后随访重点');
  assert.equal(result.pages, 1);
});

test('formats short Docling unavailable reasons for the UI', () => {
  assert.equal(createDoclingUnavailableMessage({ code: 'ENOENT' }), '未检测到 Docling，已自动使用兼容解析。');
  assert.equal(createDoclingUnavailableMessage(new Error('timeout')), 'Docling 解析未完成，已自动使用兼容解析。');
});

test('runs Docling with standard local parsing and OCR disabled by default', () => {
  const args = buildDoclingArgs('/tmp/paper.pdf', '/tmp/out', 30000);

  assert.deepEqual(args, [
    '--pipeline', 'standard',
    '--no-ocr',
    '--tables',
    '--table-mode', 'accurate',
    '--to', 'md',
    '--output', '/tmp/out',
    '--document-timeout', '30',
    '/tmp/paper.pdf'
  ]);
});
