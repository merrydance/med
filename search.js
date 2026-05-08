// ====== 搜索技能模块 ======

/**
 * PubMed 搜索 (免费, 无需 API Key)
 * 使用 NCBI E-utilities API
 */
async function searchPubMed(query, maxResults = 8) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10秒超时
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=date`;
    const searchResp = await fetch(searchUrl, { signal: controller.signal });
    if (!searchResp.ok) throw new Error(`HTTP ${searchResp.status}`);
    const searchData = await searchResp.json();
    const ids = searchData.esearchresult?.idlist;
    if (!ids || ids.length === 0) return null;

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryResp = await fetch(summaryUrl, { signal: controller.signal });
    if (!summaryResp.ok) throw new Error(`HTTP ${summaryResp.status}`);
    const summaryData = await summaryResp.json();

    const results = [];
    for (const id of ids) {
      const article = summaryData.result?.[id];
      if (!article || article.error) continue;
      results.push({
        pmid: id,
        title: article.title || '',
        authors: (article.authors || []).map(a => a.name).slice(0, 3).join(', '),
        journal: article.fulljournalname || article.source || '',
        pubdate: article.pubdate || '',
        doi: (article.articleids || []).find(a => a.idtype === 'doi')?.value || '',
      });
    }
    return results.length > 0 ? results : null;
  } catch (err) {
    console.warn('PubMed 搜索失败 (已跳过):', err.message);
    return null;
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
  const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超时
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

  if (pubmedResults && pubmedResults.length > 0) {
    context += '\n\n📚 【PubMed 最新检索结果】\n';
    pubmedResults.forEach((r, i) => {
      context += `\n${i + 1}. ${r.title}\n`;
      context += `   作者: ${r.authors}${r.authors ? ' et al.' : ''}\n`;
      context += `   期刊: ${r.journal} (${r.pubdate})\n`;
      context += `   PMID: ${r.pmid}`;
      if (r.doi) context += ` | DOI: ${r.doi}`;
      context += '\n';
    });
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

// 神经外科相关 Tavily 搜索限定域名
const NEURO_SEARCH_DOMAINS = [
  'pubmed.ncbi.nlm.nih.gov',
  'thejns.org',
  'journals.lww.com',
  'thelancet.com',
  'nejm.org',
  'nature.com',
  'clinicaltrials.gov',
];
