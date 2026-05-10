const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chunkText,
  rankChunks,
  buildDocumentContext
} = require('../../src-main/rag.js');

test('chunks long text with bounded overlap', () => {
  const text = Array.from({ length: 12 }, (_, index) => `第${index + 1}段：脑膜瘤术后管理需要记录影像、剂量和随访结果。`).join('\n\n');

  const chunks = chunkText(text, { chunkSize: 120, overlap: 20 });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 145));
  assert.ok(chunks[1].text.includes(chunks[0].text.slice(-20).trim().slice(0, 6)));
});

test('ranks chunks by Chinese and English medical query terms', () => {
  const chunks = [
    { index: 0, text: '这一段讨论脑膜瘤影像随访和术后复查。' },
    { index: 1, text: '成人胶质母细胞瘤 temozolomide 剂量通常按体表面积计算，并记录不良反应。' },
    { index: 2, text: '研究方法包括纳入标准、排除标准和统计学分析。' }
  ];

  const ranked = rankChunks('胶质母细胞瘤 temozolomide 剂量', chunks);

  assert.equal(ranked[0].index, 1);
  assert.ok(ranked[0].score > ranked[1].score);
});

test('uses full text for short documents', () => {
  const result = buildDocumentContext({
    name: 'short.md',
    text: '这是一篇短文档，包含动脉瘤夹闭术后的随访重点。',
    query: '随访重点',
    maxFullTextChars: 1000
  });

  assert.equal(result.mode, 'full');
  assert.equal(result.context, '这是一篇短文档，包含动脉瘤夹闭术后的随访重点。');
  assert.equal(result.chunks.length, 0);
});

test('selects top relevant chunks for long documents instead of returning everything', () => {
  const noise = Array.from({ length: 80 }, (_, index) => `背景段落 ${index + 1}：这里讨论一般研究背景、统计方法和随访流程。`).join('\n\n');
  const target = '关键段落：垂体腺瘤术后尿崩症需要记录出入量，去氨加压素剂量应结合尿量、血钠和渗透压调整。';
  const text = `${noise}\n\n${target}\n\n${noise}`;

  const result = buildDocumentContext({
    name: 'guideline.pdf',
    text,
    query: '垂体腺瘤术后尿崩症 去氨加压素剂量',
    maxFullTextChars: 1000,
    chunkSize: 280,
    overlap: 40,
    topK: 3,
    maxContextChars: 900
  });

  assert.equal(result.mode, 'rag');
  assert.ok(result.context.includes('去氨加压素剂量'));
  assert.ok(result.context.length < text.length);
  assert.ok(result.chunks.length <= 3);
});
