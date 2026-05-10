#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('../src-main/documentParser.js');
const { createEvaluationRecord } = require('../src-main/documentEvaluation.js');

async function main() {
  const inputDir = process.argv[2];
  if (!inputDir) {
    console.error('用法: node scripts/evaluate-documents.js <pdf目录> [输出目录]');
    process.exit(1);
  }

  const outputDir = process.argv[3] || path.join(process.cwd(), 'reports', 'document-eval');
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(inputDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.pdf'))
    .map((fileName) => path.join(inputDir, fileName));

  if (!files.length) {
    console.error(`未在目录中找到 PDF: ${inputDir}`);
    process.exit(1);
  }

  const outputPath = path.join(outputDir, `document-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const stream = fs.createWriteStream(outputPath, { flags: 'w' });

  for (const filePath of files) {
    const startedAt = Date.now();
    let record;
    try {
      const result = await parseDocument(filePath);
      record = createEvaluationRecord({
        filePath,
        startedAt,
        endedAt: Date.now(),
        result
      });
    } catch (error) {
      record = createEvaluationRecord({
        filePath,
        startedAt,
        endedAt: Date.now(),
        error
      });
    }

    stream.write(`${JSON.stringify(record)}\n`);
    const label = record.status === 'ok'
      ? `${record.summary.provider}${record.summary.fallbackFrom ? ` fallback=${record.summary.fallbackFrom}` : ''}`
      : `error=${record.error}`;
    console.log(`${path.basename(filePath)} -> ${label} (${record.elapsedMs}ms)`);
  }

  stream.end();
  console.log(`评测记录已写入: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
