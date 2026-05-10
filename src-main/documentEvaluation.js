const PREVIEW_CHARS = 1000;

function summarizeParseResult(result) {
  const markdown = String(result.markdown || '');
  const text = String(result.text || '');
  const tableLikeLines = markdown
    .split('\n')
    .filter((line) => line.trim().startsWith('|') && line.includes('|', 1))
    .length;

  return {
    fileName: result.name,
    provider: result.provider,
    fallbackFrom: result.fallbackFrom || null,
    pages: result.pages || 1,
    textChars: text.length,
    markdownChars: markdown.length,
    tableLikeLines,
    warnings: result.warnings || [],
    textPreview: text.slice(0, PREVIEW_CHARS)
  };
}

function createEvaluationRecord({ filePath, startedAt, endedAt, result, error }) {
  const record = {
    filePath,
    status: error ? 'error' : 'ok',
    elapsedMs: Math.max(0, endedAt - startedAt)
  };

  if (error) {
    return {
      ...record,
      error: error.message || String(error)
    };
  }

  return {
    ...record,
    summary: summarizeParseResult(result)
  };
}

module.exports = {
  summarizeParseResult,
  createEvaluationRecord
};
