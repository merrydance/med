const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEvaluationRecord,
  summarizeParseResult
} = require('../../src-main/documentEvaluation.js');

test('summarizes parser output without storing full paper text', () => {
  const summary = summarizeParseResult({
    name: 'paper.pdf',
    provider: 'docling',
    fallbackFrom: null,
    pages: 12,
    text: 'A'.repeat(3000),
    markdown: '| Group | P value |\n|---|---:|\n| A | 0.03 |',
    warnings: []
  });

  assert.deepEqual(summary, {
    fileName: 'paper.pdf',
    provider: 'docling',
    fallbackFrom: null,
    pages: 12,
    textChars: 3000,
    markdownChars: 43,
    tableLikeLines: 3,
    warnings: [],
    textPreview: 'A'.repeat(1000)
  });
});

test('creates evaluation records with elapsed time and status', () => {
  const record = createEvaluationRecord({
    filePath: '/papers/paper.pdf',
    startedAt: 1000,
    endedAt: 2500,
    result: {
      name: 'paper.pdf',
      provider: 'pdf-parse',
      fallbackFrom: 'docling',
      pages: 2,
      text: '兼容解析文本',
      markdown: '',
      warnings: ['未检测到 Docling，已自动使用兼容解析。']
    }
  });

  assert.equal(record.status, 'ok');
  assert.equal(record.elapsedMs, 1500);
  assert.equal(record.filePath, '/papers/paper.pdf');
  assert.equal(record.summary.provider, 'pdf-parse');
  assert.deepEqual(record.summary.warnings, ['未检测到 Docling，已自动使用兼容解析。']);
});

test('creates failed evaluation records without throwing', () => {
  const record = createEvaluationRecord({
    filePath: '/papers/broken.pdf',
    startedAt: 1000,
    endedAt: 1100,
    error: new Error('parse failed')
  });

  assert.equal(record.status, 'error');
  assert.equal(record.elapsedMs, 100);
  assert.equal(record.error, 'parse failed');
});
