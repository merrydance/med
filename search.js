// ====== 搜索技能模块 ======

function containsCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''));
}

function uniqueTerms(terms) {
  return Array.from(new Set(terms.map((term) => String(term || '').trim()).filter(Boolean)));
}

function buildFallbackPubMedQuery(query) {
  const originalQuery = String(query || '').trim();
  const wasTranslated = containsCjk(originalQuery);
  return {
    originalQuery,
    source: 'fallback',
    pubmedQueries: [originalQuery].filter(Boolean),
    pubmedQuery: originalQuery,
    wasTranslated,
    guidance: wasTranslated
      ? 'PubMed 对英文检索词和 MeSH/ATM 更友好；当前未使用模型检索规划，已保留原始问题作为透明兜底检索。'
      : ''
  };
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // Fall through to brace extraction.
      }
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizePubMedQuery(query) {
  return String(query || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function getMeaningfulOriginalTokens(originalQuery) {
  return String(originalQuery || '')
    .toLowerCase()
    .match(/[a-z0-9]{3,}|[\u3400-\u9fff]{2,}/g) || [];
}

function isGenericPubMedQuery(pubmedQuery, originalQuery) {
  const normalized = String(pubmedQuery || '').toLowerCase();
  if (!normalized) return true;

  const fieldless = normalized
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/["()]/g, ' ')
    .replace(/\b(and|or|not)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const terms = Array.from(new Set(fieldless.split(/\s+/).filter(Boolean)));
  const genericTerms = new Set([
    'surgery',
    'surgical',
    'treatment',
    'therapy',
    'diagnosis',
    'review',
    'guideline',
    'clinical',
    'trial',
    'outcome',
    'outcomes',
    'prognosis',
    'complication',
    'complications',
    'resection',
    'management',
    'glioma',
    'tumor',
    'tumour',
    'neoplasm',
    'neoplasms',
    'brain'
  ]);
  if (terms.length > 0 && terms.every((term) => genericTerms.has(term))) return true;

  const genericOnlyPatterns = [
    /^\(?\s*surgery\s+or\s+surgery\[title\/abstract\]\s*\)?$/i,
    /^\(?\s*treatment\s+or\s+treatment\[title\/abstract\]\s*\)?$/i,
    /^\(?\s*glioma\s+or\s+glioma\[title\/abstract\]\s*\)?$/i,
    /^\(?\s*diagnosis\s+or\s+diagnosis\[title\/abstract\]\s*\)?$/i,
    /^\(?\s*review\s+or\s+review\[title\/abstract\]\s*\)?$/i
  ];
  if (genericOnlyPatterns.some((pattern) => pattern.test(pubmedQuery.trim()))) return true;

  const tokens = getMeaningfulOriginalTokens(originalQuery);
  const hasSpecificOriginalSignal = tokens.some((token) => normalized.includes(token));
  const hasSearchFieldSpecificity = /\[mesh terms\]|\[mesh\]|\[author\]|\[affiliation\]/i.test(normalized);
  const hasPhraseSpecificity = /"[a-z][^"]{4,}"/i.test(pubmedQuery);
  const hasNonGenericTerm = terms.some((term) => !genericTerms.has(term) && term.length >= 4);

  return !hasSpecificOriginalSignal && !hasSearchFieldSpecificity && !hasPhraseSpecificity && !hasNonGenericTerm;
}

function normalizeSearchPlan(rawPlan, originalQuery) {
  const pubmedQueries = uniqueTerms(Array.isArray(rawPlan?.pubmedQueries) ? rawPlan.pubmedQueries : [])
    .map(sanitizePubMedQuery)
    .filter(Boolean)
    .filter((pubmedQuery) => !isGenericPubMedQuery(pubmedQuery, originalQuery))
    .slice(0, 4);

  if (!pubmedQueries.length) return null;

  return {
    originalQuery,
    source: 'llm',
    pubmedQueries,
    pubmedQuery: pubmedQueries.join(' OR '),
    tavilyQuery: String(rawPlan?.tavilyQuery || originalQuery).trim().slice(0, 500),
    reasoning: String(rawPlan?.reasoning || '').trim().slice(0, 500),
    guidance: 'PubMed 检索式由模型基于当前问题和上下文生成；代码只执行检索并只允许引用真实返回的 PMID、DOI 和链接。'
  };
}

async function planSearchQueries({ query, planner } = {}) {
  const originalQuery = String(query || '').trim();
  if (!planner) return buildFallbackPubMedQuery(originalQuery);

  try {
    const rawPlan = await planner(originalQuery);
    const parsedPlan = typeof rawPlan === 'string' ? extractJsonObject(rawPlan) : rawPlan;
    return normalizeSearchPlan(parsedPlan, originalQuery) || buildFallbackPubMedQuery(originalQuery);
  } catch (error) {
    console.warn('模型检索规划失败，使用透明兜底检索:', error.message);
    return buildFallbackPubMedQuery(originalQuery);
  }
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanXmlText(text) {
  return decodeXmlEntities(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAttr(attrs, name) {
  const match = String(attrs || '').match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? decodeXmlEntities(match[1]).trim() : '';
}

function extractTagContents(xml, tagName) {
  const contents = [];
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = cleanXmlText(match[1]);
    if (text) contents.push(text);
  }
  return contents;
}

function parsePubMedDetailsXml(xml) {
  const details = {};
  const articleRegex = /<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/gi;
  let articleMatch;

  while ((articleMatch = articleRegex.exec(String(xml || ''))) !== null) {
    const articleXml = articleMatch[0];
    const pmid = extractTagContents(articleXml, 'PMID')[0];
    if (!pmid) continue;

    const abstractParts = [];
    const abstractRegex = /<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi;
    let abstractMatch;
    while ((abstractMatch = abstractRegex.exec(articleXml)) !== null) {
      const label = getAttr(abstractMatch[1], 'Label');
      const text = cleanXmlText(abstractMatch[2]);
      if (!text) continue;
      abstractParts.push(label ? `${label}: ${text}` : text);
    }

    details[pmid] = {
      abstract: abstractParts.join(' '),
      publicationTypes: Array.from(new Set(extractTagContents(articleXml, 'PublicationType')))
    };
  }

  return details;
}

async function fetchPubMedDetails(ids, { fetchImpl = fetch, signal } = {}) {
  if (!ids?.length) return {};
  const detailsUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
  const detailsResp = await fetchImpl(detailsUrl, { signal });
  if (!detailsResp.ok) throw new Error(`HTTP ${detailsResp.status}`);
  return parsePubMedDetailsXml(await detailsResp.text());
}

function truncateText(text, maxLength = 1200) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

async function fetchPubMedIds(pubmedQuery, maxResults, fetchImpl, signal) {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(pubmedQuery)}&retmax=${maxResults}&retmode=json&sort=date`;
  const searchResp = await fetchImpl(searchUrl, { signal });
  if (!searchResp.ok) throw new Error(`HTTP ${searchResp.status}`);
  const searchData = await searchResp.json();
  return searchData.esearchresult?.idlist || [];
}

/**
 * PubMed 搜索 (免费, 无需 API Key)
 * 使用模型生成的检索计划；无 planner 时仅透明兜底原始 query。
 */
async function searchPubMed(query, maxResults = 8, options = {}) {
  const queryInfo = options.searchPlan || await planSearchQueries({ query, planner: options.planner });
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const ids = [];
    for (const pubmedQuery of queryInfo.pubmedQueries || []) {
      const nextIds = await fetchPubMedIds(pubmedQuery, maxResults, fetchImpl, controller.signal);
      nextIds.forEach((id) => {
        if (!ids.includes(id)) ids.push(id);
      });
      if (ids.length >= maxResults) break;
    }

    const selectedIds = ids.slice(0, maxResults);
    if (selectedIds.length === 0) return { queryInfo, results: [] };

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${selectedIds.join(',')}&retmode=json`;
    const summaryResp = await fetchImpl(summaryUrl, { signal: controller.signal });
    if (!summaryResp.ok) throw new Error(`HTTP ${summaryResp.status}`);
    const summaryData = await summaryResp.json();
    let detailsById = {};
    try {
      detailsById = await fetchPubMedDetails(selectedIds, {
        fetchImpl,
        signal: controller.signal
      });
    } catch (detailsError) {
      console.warn('PubMed 摘要详情获取失败 (保留基础引文):', detailsError.message);
    }

    const results = [];
    for (const id of selectedIds) {
      const article = summaryData.result?.[id];
      if (!article || article.error) continue;
      const details = detailsById[id] || {};
      results.push({
        pmid: id,
        title: article.title || '',
        authors: (article.authors || []).map(a => a.name).slice(0, 3).join(', '),
        journal: article.fulljournalname || article.source || '',
        pubdate: article.pubdate || '',
        doi: (article.articleids || []).find(a => a.idtype === 'doi')?.value || '',
        abstract: details.abstract || '',
        publicationTypes: details.publicationTypes || [],
      });
    }
    return { queryInfo, results };
  } catch (err) {
    console.warn('PubMed 搜索失败 (已跳过):', err.message);
    return { queryInfo, results: [] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Tavily 联网搜索 (需要 API Key)
 * 返回 AI-ready 的网页内容
 */
async function searchTavily(query, apiKey, domains = []) {
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
        include_answer: true,
        include_domains: domains.length > 0 ? domains : undefined,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return {
      answer: data.answer || '',
      results: (data.results || []).map(r => ({
        title: r.title || '',
        url: r.url || '',
        content: (r.content || '').slice(0, 500),
      })),
    };
  } catch (err) {
    console.warn('Tavily 搜索失败 (已跳过):', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 将搜索结果格式化为 LLM 上下文
 */
function formatSearchContext(pubmedResults, tavilyResults) {
  let context = '';
  const normalizedPubMed = Array.isArray(pubmedResults)
    ? { queryInfo: null, results: pubmedResults }
    : pubmedResults;
  const queryInfo = normalizedPubMed?.queryInfo;
  const pubmedItems = normalizedPubMed?.results || [];

  if (queryInfo) {
    context += '\n\n【PubMed 检索说明】\n';
    context += `原始问题: ${queryInfo.originalQuery}\n`;
    context += 'PubMed 实际检索式:\n';
    (queryInfo.pubmedQueries || [queryInfo.pubmedQuery].filter(Boolean)).forEach((pubmedQuery, index) => {
      context += `${index + 1}. ${pubmedQuery}\n`;
    });
    if (queryInfo.reasoning) context += `检索规划依据: ${queryInfo.reasoning}\n`;
    if (queryInfo.guidance) context += `${queryInfo.guidance}\n`;
    context += '回答时只能引用下列检索结果中真实存在的 PMID、DOI 和链接；不得编造 PMID、DOI、指南名、试验名或统计结果。\n';
  }

  if (pubmedItems.length > 0) {
    context += '\n\n📚 【PubMed 最新检索结果】\n';
    pubmedItems.forEach((r, i) => {
      context += `\n${i + 1}. ${r.title}\n`;
      context += `   作者: ${r.authors}${r.authors ? ' et al.' : ''}\n`;
      context += `   期刊: ${r.journal} (${r.pubdate})\n`;
      context += `   PMID: ${r.pmid} | PubMed: https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`;
      if (r.doi) context += ` | DOI: https://doi.org/${r.doi}`;
      context += '\n';
      if (r.publicationTypes?.length) context += `   文献类型: ${r.publicationTypes.join('; ')}\n`;
      if (r.abstract) context += `   摘要: ${truncateText(r.abstract)}\n`;
    });
  } else if (queryInfo) {
    context += '\n\n📚 【PubMed 最新检索结果】\n未检索到可用 PubMed 结果；回答中必须明确说明证据不足，不得补造引用。\n';
  }

  if (tavilyResults) {
    if (tavilyResults.answer) {
      context += `\n\n🌐 【联网搜索摘要】\n${tavilyResults.answer}\n`;
    }
    if (tavilyResults.results?.length > 0) {
      context += '\n🌐 【网页搜索结果】\n';
      tavilyResults.results.forEach((r, i) => {
        context += `\n${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}\n`;
      });
    }
  }

  return context;
}

const NEURO_SEARCH_DOMAINS = [
  'pubmed.ncbi.nlm.nih.gov',
  'thejns.org',
  'journals.lww.com',
  'thelancet.com',
  'nejm.org',
  'nature.com',
  'clinicaltrials.gov',
];

module.exports = {
  buildFallbackPubMedQuery,
  planSearchQueries,
  searchPubMed,
  searchTavily,
  formatSearchContext,
  NEURO_SEARCH_DOMAINS
};
