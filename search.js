// ====== 搜索技能模块 ======

function containsCjk(text) {
  return /[\u3400-\u9fff]/.test(String(text || ''));
}

// Hand-curated search hints, not an official MeSH/UMLS/SNOMED terminology map.
const PUBMED_SEARCH_HINT_GROUPS = [
  { terms: ['胶质母细胞瘤', 'GBM'], textWords: ['glioblastoma', 'GBM'], mesh: ['Glioblastoma'] },
  { terms: ['低级别胶质瘤', '低级别胶质细胞瘤'], english: 'low-grade glioma' },
  { terms: ['弥漫性胶质瘤'], english: 'diffuse glioma' },
  { terms: ['胶质瘤', '胶质细胞瘤'], textWords: ['glioma'], mesh: ['Glioma'] },
  { terms: ['脑膜瘤'], textWords: ['meningioma'], mesh: ['Meningioma'] },
  { terms: ['垂体腺瘤', '垂体瘤'], textWords: ['pituitary adenoma'], mesh: ['Pituitary Neoplasms'] },
  { terms: ['听神经瘤', '前庭神经鞘瘤'], textWords: ['vestibular schwannoma', 'acoustic neuroma'], mesh: ['Neuroma, Acoustic'] },
  { terms: ['颅咽管瘤'], textWords: ['craniopharyngioma'], mesh: ['Craniopharyngioma'] },
  { terms: ['脑转移瘤', '脑转移'], english: 'brain metastasis' },
  { terms: ['髓母细胞瘤'], textWords: ['medulloblastoma'], mesh: ['Medulloblastoma'] },
  { terms: ['室管膜瘤'], textWords: ['ependymoma'], mesh: ['Ependymoma'] },
  { terms: ['中枢神经系统淋巴瘤', 'CNS淋巴瘤'], english: 'primary central nervous system lymphoma' },
  { terms: ['脊索瘤'], textWords: ['chordoma'], mesh: ['Chordoma'] },
  { terms: ['血管母细胞瘤'], textWords: ['hemangioblastoma'], mesh: ['Hemangioblastoma'] },

  { terms: ['未破裂动脉瘤'], english: 'unruptured intracranial aneurysm' },
  { terms: ['颅内动脉瘤', '脑动脉瘤', '动脉瘤'], textWords: ['intracranial aneurysm'], mesh: ['Intracranial Aneurysm'] },
  { terms: ['蛛网膜下腔出血', 'SAH'], textWords: ['subarachnoid hemorrhage', 'SAH'], mesh: ['Subarachnoid Hemorrhage'] },
  { terms: ['脑动静脉畸形', '动静脉畸形', 'AVM'], textWords: ['arteriovenous malformation', 'AVM'], mesh: ['Intracranial Arteriovenous Malformations'] },
  { terms: ['海绵状血管畸形', '海绵状血管瘤'], english: 'cavernous malformation' },
  { terms: ['烟雾病'], textWords: ['moyamoya disease'], mesh: ['Moyamoya Disease'] },
  { terms: ['硬脑膜动静脉瘘', '硬膜动静脉瘘'], english: 'dural arteriovenous fistula' },
  { terms: ['脑出血', '颅内出血'], textWords: ['intracerebral hemorrhage'], mesh: ['Cerebral Hemorrhage'] },
  { terms: ['缺血性卒中', '脑梗死'], textWords: ['ischemic stroke'], mesh: ['Ischemic Stroke'] },
  { terms: ['颈动脉狭窄'], textWords: ['carotid stenosis'], mesh: ['Carotid Stenosis'] },

  { terms: ['颈椎病脊髓病', '颈椎脊髓病'], english: 'cervical spondylotic myelopathy' },
  { terms: ['腰椎管狭窄'], textWords: ['lumbar spinal stenosis'], mesh: ['Spinal Stenosis'] },
  { terms: ['脊髓肿瘤'], textWords: ['spinal cord tumor'], mesh: ['Spinal Cord Neoplasms'] },
  { terms: ['椎管内肿瘤'], english: 'intradural spinal tumor' },
  { terms: ['脊柱转移瘤', '脊柱转移'], english: 'spinal metastasis' },
  { terms: ['脊髓损伤'], textWords: ['spinal cord injury'], mesh: ['Spinal Cord Injuries'] },

  { terms: ['帕金森病', '帕金森'], textWords: ['Parkinson disease'], mesh: ['Parkinson Disease'] },
  { terms: ['深部脑刺激', '脑深部电刺激', 'DBS'], textWords: ['deep brain stimulation', 'DBS'], mesh: ['Deep Brain Stimulation'] },
  { terms: ['三叉神经痛'], textWords: ['trigeminal neuralgia'], mesh: ['Trigeminal Neuralgia'] },
  { terms: ['面肌痉挛'], textWords: ['hemifacial spasm'], mesh: ['Hemifacial Spasm'] },
  { terms: ['癫痫'], textWords: ['epilepsy'], mesh: ['Epilepsy'] },
  { terms: ['迷走神经刺激'], textWords: ['vagus nerve stimulation'], mesh: ['Vagus Nerve Stimulation'] },
  { terms: ['微血管减压'], english: 'microvascular decompression' },

  { terms: ['颅脑外伤', '创伤性脑损伤', '脑外伤'], textWords: ['traumatic brain injury'], mesh: ['Brain Injuries, Traumatic'] },
  { terms: ['颅内压'], textWords: ['intracranial pressure'], mesh: ['Intracranial Pressure'] },
  { terms: ['脑水肿'], textWords: ['cerebral edema'], mesh: ['Brain Edema'] },
  { terms: ['脑疝'], english: 'brain herniation' },
  { terms: ['慢性硬膜下血肿'], textWords: ['chronic subdural hematoma'], mesh: ['Hematoma, Subdural, Chronic'] },
  { terms: ['硬膜外血肿'], textWords: ['epidural hematoma'], mesh: ['Hematoma, Epidural, Cranial'] },
  { terms: ['硬膜下血肿'], textWords: ['subdural hematoma'], mesh: ['Hematoma, Subdural'] },
  { terms: ['脑积水'], textWords: ['hydrocephalus'], mesh: ['Hydrocephalus'] },
  { terms: ['脑室外引流', 'EVD'], english: 'external ventricular drain' },
  { terms: ['脑室腹腔分流', 'VP分流'], english: 'ventriculoperitoneal shunt' },

  { terms: ['内镜经鼻手术', '内镜经鼻', '经鼻内镜'], english: 'endoscopic endonasal surgery' },
  { terms: ['经蝶手术', '经鼻蝶手术'], english: 'transsphenoidal surgery' },
  { terms: ['显微手术'], textWords: ['microsurgery'], mesh: ['Microsurgery'] },
  { terms: ['神经内镜'], english: 'neuroendoscopy' },
  { terms: ['立体定向'], textWords: ['stereotactic'], mesh: ['Stereotaxic Techniques'] },
  { terms: ['栓塞'], textWords: ['embolization'], mesh: ['Embolization, Therapeutic'] },
  { terms: ['夹闭'], english: 'clipping' },
  { terms: ['弹簧圈'], english: 'coiling' },
  { terms: ['血管内治疗', '介入治疗'], english: 'endovascular treatment' },
  { terms: ['搭桥'], english: 'bypass' },
  { terms: ['去骨瓣减压', '去骨瓣'], english: 'decompressive craniectomy' },
  { terms: ['切除', '手术切除'], english: 'resection' },
  { terms: ['全切'], english: 'gross total resection' },

  { terms: ['尿崩症'], textWords: ['diabetes insipidus'], mesh: ['Diabetes Insipidus'] },
  { terms: ['脑脊液漏'], textWords: ['cerebrospinal fluid leak'], mesh: ['Cerebrospinal Fluid Leak'] },
  { terms: ['垂体功能低下'], textWords: ['hypopituitarism'], mesh: ['Hypopituitarism'] },
  { terms: ['并发症', '并发'], english: 'complication' },
  { terms: ['复发'], textWords: ['recurrence'], mesh: ['Recurrence'] },
  { terms: ['预后'], textWords: ['prognosis'], mesh: ['Prognosis'] },
  { terms: ['生存'], textWords: ['survival'], mesh: ['Survival'] },
  { terms: ['总生存'], english: 'overall survival' },
  { terms: ['无进展生存'], english: 'progression-free survival' },
  { terms: ['死亡率'], textWords: ['mortality'], mesh: ['Mortality'] },
  { terms: ['风险因素'], textWords: ['risk factors'], mesh: ['Risk Factors'] },
  { terms: ['生活质量'], textWords: ['quality of life'], mesh: ['Quality of Life'] },
  { terms: ['神经功能'], english: 'neurological outcome' },
  { terms: ['认知功能'], english: 'cognitive function' },

  { terms: ['诊断'], english: 'diagnosis' },
  { terms: ['影像', '影像学'], textWords: ['imaging'], mesh: ['Neuroimaging'] },
  { terms: ['MRI', '磁共振'], textWords: ['magnetic resonance imaging', 'MRI'], mesh: ['Magnetic Resonance Imaging'] },
  { terms: ['分子分型'], english: 'molecular classification' },
  { terms: ['治疗'], english: 'treatment' },
  { terms: ['手术'], english: 'surgery' },
  { terms: ['放疗'], english: 'radiotherapy' },
  { terms: ['化疗'], english: 'chemotherapy' },
  { terms: ['免疫治疗'], english: 'immunotherapy' },
  { terms: ['靶向治疗'], english: 'targeted therapy' },
  { terms: ['电场治疗'], english: 'tumor treating fields' },
  { terms: ['替莫唑胺'], english: 'temozolomide' },
  { terms: ['贝伐珠单抗'], english: 'bevacizumab' },
  { terms: ['指南'], textWords: ['guideline'], mesh: ['Guideline'] },
  { terms: ['系统综述'], textWords: ['systematic review'], mesh: ['Systematic Reviews as Topic'] },
  { terms: ['荟萃分析', 'meta分析'], textWords: ['meta-analysis'], mesh: ['Meta-Analysis as Topic'] },
  { terms: ['综述'], english: 'review' },
  { terms: ['随机对照试验', 'RCT'], textWords: ['randomized controlled trial', 'RCT'], mesh: ['Randomized Controlled Trials as Topic'] },
  { terms: ['临床试验'], textWords: ['clinical trial'], mesh: ['Clinical Trials as Topic'] },
  { terms: ['队列研究', '队列'], textWords: ['cohort study'], mesh: ['Cohort Studies'] },
  { terms: ['真实世界'], english: 'real-world evidence' }
];

function uniqueTerms(terms) {
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

function normalizeSearchHintGroup(group) {
  const textWords = group.textWords || (group.english ? [group.english] : []);
  return {
    textWords,
    mesh: group.mesh || []
  };
}

function uniqueSearchHints(hints) {
  const seen = new Set();
  return hints.filter((hint) => {
    const key = [
      ...uniqueTerms(hint.mesh || []).map((term) => `mesh:${term.toLowerCase()}`),
      ...uniqueTerms(hint.textWords || []).map((term) => `text:${term.toLowerCase()}`)
    ].join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findSearchHints(query) {
  const normalizedQuery = String(query || '').toLowerCase();
  const hints = PUBMED_SEARCH_HINT_GROUPS
    .flatMap((group) => group.terms.map((term) => ({
      term,
      hint: normalizeSearchHintGroup(group)
    })))
    .sort((a, b) => b.term.length - a.term.length)
    .filter(({ term }) => normalizedQuery.includes(term.toLowerCase()))
    .map(({ hint }) => hint);
  return uniqueSearchHints(hints);
}

function formatPubMedTextWord(term, { allowAutomaticTermMapping } = { allowAutomaticTermMapping: true }) {
  const trimmedTerm = String(term || '').trim();
  if (!trimmedTerm) return '';
  if (!allowAutomaticTermMapping) return trimmedTerm;
  return `(${trimmedTerm} OR ${trimmedTerm}[Title/Abstract])`;
}

function formatPubMedSearchHint(hint) {
  const meshClauses = uniqueTerms(hint.mesh || [])
    .map((term) => `"${term}"[Mesh]`);
  const textClauses = uniqueTerms(hint.textWords || [])
    .map((term) => `${term} OR ${term}[Title/Abstract]`);
  const clauses = [...meshClauses, ...textClauses];
  if (clauses.length === 0) return '';
  return `(${clauses.join(' OR ')})`;
}

function buildPubMedQuery(query) {
  const originalQuery = String(query || '').trim();
  const wasTranslated = containsCjk(originalQuery);

  if (!wasTranslated) {
    return {
      originalQuery,
      pubmedQuery: originalQuery,
      wasTranslated: false,
      guidance: ''
    };
  }

  const matchedHints = findSearchHints(originalQuery);
  const hasSearchHints = matchedHints.length > 0;
  const pubmedTerms = hasSearchHints ? matchedHints : [originalQuery].filter(Boolean);

  const pubmedQuery = pubmedTerms
    .map((term) => {
      if (typeof term === 'string') {
        return formatPubMedTextWord(term, { allowAutomaticTermMapping: false });
      }
      return formatPubMedSearchHint(term);
    })
    .filter(Boolean)
    .join(' AND ');

  return {
    originalQuery,
    pubmedQuery: pubmedQuery || originalQuery,
    wasTranslated: true,
    guidance: hasSearchHints
      ? 'PubMed 对英文检索词和 MeSH/ATM 更友好；检测到中文输入，已使用内置检索提示词生成 PubMed 检索式，并在已核对的概念上加入 MeSH heading，同时保留自由词以覆盖未完成 MeSH 标引的新文献。'
      : 'PubMed 对英文检索词和 MeSH/ATM 更友好；未匹配到内置检索提示词，已保留原始中文检索词，建议补充英文疾病、术式或结局词。'
  };
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

/**
 * PubMed 搜索 (免费, 无需 API Key)
 * 使用 NCBI E-utilities API
 */
async function searchPubMed(query, maxResults = 8, options = {}) {
  const queryInfo = buildPubMedQuery(query);
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10秒超时
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(queryInfo.pubmedQuery)}&retmax=${maxResults}&retmode=json&sort=date`;
    const searchResp = await fetchImpl(searchUrl, { signal: controller.signal });
    if (!searchResp.ok) throw new Error(`HTTP ${searchResp.status}`);
    const searchData = await searchResp.json();
    const ids = searchData.esearchresult?.idlist;
    if (!ids || ids.length === 0) return { queryInfo, results: [] };

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryResp = await fetchImpl(summaryUrl, { signal: controller.signal });
    if (!summaryResp.ok) throw new Error(`HTTP ${summaryResp.status}`);
    const summaryData = await summaryResp.json();
    let detailsById = {};
    try {
      detailsById = await fetchPubMedDetails(ids, {
        fetchImpl,
        signal: controller.signal
      });
    } catch (detailsError) {
      console.warn('PubMed 摘要详情获取失败 (保留基础引文):', detailsError.message);
    }

    const results = [];
    for (const id of ids) {
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
  const normalizedPubMed = Array.isArray(pubmedResults)
    ? { queryInfo: null, results: pubmedResults }
    : pubmedResults;
  const queryInfo = normalizedPubMed?.queryInfo;
  const pubmedItems = normalizedPubMed?.results || [];

  if (queryInfo) {
    context += '\n\n【PubMed 检索说明】\n';
    context += `原始问题: ${queryInfo.originalQuery}\n`;
    context += `PubMed 实际检索式: ${queryInfo.pubmedQuery}\n`;
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

module.exports = {
  buildPubMedQuery,
  searchPubMed,
  searchTavily,
  formatSearchContext,
  NEURO_SEARCH_DOMAINS
};
