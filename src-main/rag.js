const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 150;
const DEFAULT_TOP_K = 5;
const DEFAULT_MAX_FULL_TEXT_CHARS = 15000;
const DEFAULT_MAX_CONTEXT_CHARS = 8000;

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function splitLongParagraph(paragraph, chunkSize) {
  if (paragraph.length <= chunkSize) return [paragraph];

  const sentenceParts = paragraph
    .split(/(?<=[。！？；.!?;])\s*/)
    .filter(Boolean);

  const parts = [];
  let current = '';

  for (const sentence of sentenceParts) {
    if (sentence.length > chunkSize) {
      if (current) {
        parts.push(current);
        current = '';
      }
      for (let start = 0; start < sentence.length; start += chunkSize) {
        parts.push(sentence.slice(start, start + chunkSize));
      }
      continue;
    }

    if (current && `${current}${sentence}`.length > chunkSize) {
      parts.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(options.overlap ?? DEFAULT_OVERLAP, Math.floor(chunkSize / 2));
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, chunkSize));

  const chunks = [];
  let current = '';
  let cursor = 0;

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (!trimmed) return;
    const start = normalized.indexOf(trimmed.slice(0, Math.min(32, trimmed.length)), Math.max(0, cursor - overlap));
    const safeStart = start >= 0 ? start : cursor;
    chunks.push({
      index: chunks.length,
      text: trimmed,
      start: safeStart,
      end: safeStart + trimmed.length
    });
    cursor = safeStart + Math.max(1, trimmed.length - overlap);
  };

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= chunkSize || !current) {
      current = candidate;
      continue;
    }

    const previous = current;
    pushCurrent();
    const overlapText = previous.slice(-overlap).trim();
    current = overlapText ? `${overlapText}\n\n${paragraph}` : paragraph;
  }

  pushCurrent();
  return chunks;
}

function tokenize(text) {
  const normalized = String(text || '').toLowerCase();
  const english = normalized.match(/[a-z0-9][a-z0-9+._-]*/g) || [];
  const chinese = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chineseTokens = [];

  for (const term of chinese) {
    chineseTokens.push(term);
    if (term.length <= 6) continue;
    for (let i = 0; i <= term.length - 4; i += 2) {
      chineseTokens.push(term.slice(i, i + 4));
    }
  }

  return [...english, ...chineseTokens].filter((token) => token.length > 1);
}

function termFrequency(tokens) {
  const map = new Map();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

function rankChunks(query, chunks) {
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (!queryTokens.length) {
    return chunks.map((chunk) => ({ ...chunk, score: 0 }));
  }

  const docs = chunks.map((chunk) => ({
    chunk,
    tokens: tokenize(chunk.text)
  }));
  const docCount = Math.max(1, docs.length);
  const avgLength = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / docCount || 1;
  const documentFrequency = new Map();

  for (const token of queryTokens) {
    let count = 0;
    for (const doc of docs) {
      if (doc.tokens.includes(token)) count += 1;
    }
    documentFrequency.set(token, count);
  }

  return docs
    .map((doc) => {
      const tf = termFrequency(doc.tokens);
      const docLength = doc.tokens.length || 1;
      let score = 0;

      for (const token of queryTokens) {
        const freq = tf.get(token) || 0;
        if (!freq) continue;

        const df = documentFrequency.get(token) || 0;
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
        const k1 = 1.5;
        const b = 0.75;
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (docLength / avgLength))));
      }

      return {
        ...doc.chunk,
        score
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function formatChunkContext(chunks, fileName, maxContextChars) {
  const lines = [];
  let used = 0;

  for (const chunk of chunks) {
    const header = `文档片段 ${lines.length + 1}（${fileName || '上传文档'}，chunk ${chunk.index + 1}，score ${chunk.score.toFixed(3)}）:`;
    const body = chunk.text.trim();
    const block = `${header}\n${body}`;
    if (used + block.length > maxContextChars && lines.length > 0) break;
    const remaining = maxContextChars - used - header.length - 1;
    if (remaining <= 0) break;
    lines.push(remaining < body.length ? `${header}\n${body.slice(0, remaining)}` : block);
    used += lines[lines.length - 1].length + 2;
  }

  return lines.join('\n\n');
}

function buildDocumentContext({
  name,
  text,
  query,
  maxFullTextChars = DEFAULT_MAX_FULL_TEXT_CHARS,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
  topK = DEFAULT_TOP_K,
  maxContextChars = DEFAULT_MAX_CONTEXT_CHARS
}) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      mode: 'empty',
      context: '',
      chunks: [],
      totalChunks: 0,
      originalChars: 0,
      selectedChars: 0
    };
  }

  if (normalized.length <= maxFullTextChars) {
    return {
      mode: 'full',
      context: normalized,
      chunks: [],
      totalChunks: 0,
      originalChars: normalized.length,
      selectedChars: normalized.length
    };
  }

  const chunks = chunkText(normalized, { chunkSize, overlap });
  const ranked = rankChunks(query || name || '', chunks);
  const positiveMatches = ranked.filter((chunk) => chunk.score > 0);
  const selected = (positiveMatches.length ? positiveMatches : ranked).slice(0, topK).sort((a, b) => a.index - b.index);
  const context = formatChunkContext(selected, name, maxContextChars);

  return {
    mode: 'rag',
    context,
    chunks: selected,
    totalChunks: chunks.length,
    originalChars: normalized.length,
    selectedChars: context.length
  };
}

module.exports = {
  chunkText,
  rankChunks,
  buildDocumentContext,
  tokenize
};
