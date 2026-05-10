const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFallbackPubMedQuery,
  planSearchQueries,
  searchPubMed,
  formatSearchContext
} = require('../../search.js');

test('keeps fallback PubMed query thin and transparent when no planner is available', () => {
  const queryInfo = buildFallbackPubMedQuery('少见中文短语');

  assert.equal(queryInfo.wasTranslated, true);
  assert.match(queryInfo.pubmedQuery, /少见中文短语/);
  assert.doesNotMatch(queryInfo.pubmedQuery, /\[Title\/Abstract\]/);
  assert.match(queryInfo.guidance, /未使用模型检索规划/);
});

test('uses the LLM planner for ambiguous Chinese follow-up and author queries', async () => {
  const planner = async () => ({
    pubmedQueries: [
      '("Sun GC"[Author] OR "Guochen Sun"[Author]) AND ("insular glioma" OR "insula glioma") AND (resection OR surgery)',
      '("insular glioma" OR "insula glioma") AND China'
    ],
    tavilyQuery: 'Sun Guochen insular glioma surgery PubMed',
    reasoning: '用户追问中文医生姓名和岛叶胶质瘤切除论文关系。'
  });

  const plan = await planSearchQueries({
    query: '中国的孙国臣医生是论文作者吗？他的论文和岛叶胶质瘤切除相关吗？',
    planner
  });

  assert.equal(plan.source, 'llm');
  assert.match(plan.pubmedQueries[0], /"Sun GC"\[Author\]/);
  assert.match(plan.pubmedQueries[0], /insular glioma/i);
  assert.doesNotMatch(plan.pubmedQueries.join('\n'), /KNOWN_AUTHOR|孙国臣/);
});

test('rejects planner output that collapses a specific medical question into generic terms', async () => {
  const plan = await planSearchQueries({
    query: '岛叶胶质瘤的切除方案',
    planner: async () => ({
      pubmedQueries: ['(surgery OR surgery[Title/Abstract])'],
      tavilyQuery: 'surgery',
      reasoning: '过度泛化'
    })
  });

  assert.equal(plan.source, 'fallback');
  assert.equal(plan.pubmedQuery, '岛叶胶质瘤的切除方案');
  assert.match(plan.guidance, /未使用模型检索规划/);
});

test('formats PubMed citations with traceable query, PubMed links and DOI links', () => {
  const context = formatSearchContext({
    queryInfo: {
      originalQuery: '胶质母细胞瘤复发治疗进展',
      pubmedQueries: ['(glioblastoma OR glioblastoma[Title/Abstract]) AND (recurrence OR recurrence[Title/Abstract])'],
      wasTranslated: true,
      guidance: '模型生成检索计划。'
    },
    results: [{
      pmid: '12345678',
      title: 'Treatment of recurrent glioblastoma.',
      authors: 'Smith J',
      journal: 'Neuro Oncol',
      pubdate: '2026',
      doi: '10.1000/test.doi'
    }]
  }, null);

  assert.match(context, /PubMed 实际检索式/);
  assert.match(context, /glioblastoma\[Title\/Abstract\]/);
  assert.match(context, /模型生成检索计划/);
  assert.match(context, /https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/12345678\//);
  assert.match(context, /https:\/\/doi\.org\/10\.1000\/test\.doi/);
  assert.match(context, /不得编造 PMID、DOI/);
});

test('fetches PubMed abstracts and publication types for stronger evidence context', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('esearch.fcgi')) {
      return {
        ok: true,
        json: async () => ({ esearchresult: { idlist: ['12345678'] } })
      };
    }
    if (String(url).includes('esummary.fcgi')) {
      return {
        ok: true,
        json: async () => ({
          result: {
            '12345678': {
              title: 'Treatment of recurrent glioblastoma.',
              authors: [{ name: 'Smith J' }],
              fulljournalname: 'Neuro Oncol',
              pubdate: '2026',
              articleids: [{ idtype: 'doi', value: '10.1000/test.doi' }]
            }
          }
        })
      };
    }
    if (String(url).includes('efetch.fcgi')) {
      return {
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <PubmedArticleSet>
            <PubmedArticle>
              <MedlineCitation>
                <PMID>12345678</PMID>
                <Article>
                  <Abstract>
                    <AbstractText Label="BACKGROUND">Recurrent glioblastoma has limited evidence.</AbstractText>
                    <AbstractText Label="RESULTS">Median survival improved in selected patients.</AbstractText>
                  </Abstract>
                  <PublicationTypeList>
                    <PublicationType>Randomized Controlled Trial</PublicationType>
                    <PublicationType>Clinical Trial</PublicationType>
                  </PublicationTypeList>
                </Article>
              </MedlineCitation>
            </PubmedArticle>
          </PubmedArticleSet>`
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const pubmed = await searchPubMed('recurrent glioblastoma treatment', 1, { fetchImpl });

  assert.equal(pubmed.results.length, 1);
  assert.match(pubmed.results[0].abstract, /Recurrent glioblastoma/);
  assert.deepEqual(pubmed.results[0].publicationTypes, ['Randomized Controlled Trial', 'Clinical Trial']);
  assert.ok(requests.some((url) => url.includes('efetch.fcgi')));

  const context = formatSearchContext(pubmed, null);
  assert.match(context, /文献类型: Randomized Controlled Trial; Clinical Trial/);
  assert.match(context, /摘要: BACKGROUND: Recurrent glioblastoma/);
});

test('keeps PubMed summary citations when abstract detail fetch fails', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('esearch.fcgi')) {
      return {
        ok: true,
        json: async () => ({ esearchresult: { idlist: ['12345678'] } })
      };
    }
    if (String(url).includes('esummary.fcgi')) {
      return {
        ok: true,
        json: async () => ({
          result: {
            '12345678': {
              title: 'Treatment of recurrent glioblastoma.',
              authors: [{ name: 'Smith J' }],
              source: 'Neuro Oncol',
              pubdate: '2026',
              articleids: [{ idtype: 'doi', value: '10.1000/test.doi' }]
            }
          }
        })
      };
    }
    return {
      ok: false,
      status: 503,
      text: async () => ''
    };
  };

  const pubmed = await searchPubMed('recurrent glioblastoma treatment', 1, { fetchImpl });

  assert.equal(pubmed.results.length, 1);
  assert.equal(pubmed.results[0].pmid, '12345678');
  assert.equal(pubmed.results[0].abstract, '');
  assert.deepEqual(pubmed.results[0].publicationTypes, []);
});

test('searchPubMed executes LLM-planned PubMed queries and deduplicates results', async () => {
  const requests = [];
  const planner = async () => ({
    pubmedQueries: [
      '("Sun GC"[Author] OR "Guochen Sun"[Author]) AND ("insular glioma" OR "insula glioma")',
      '("insular glioma" OR "insula glioma") AND China'
    ],
    reasoning: '测试查询规划'
  });
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('esearch.fcgi')) {
      return {
        ok: true,
        json: async () => ({ esearchresult: { idlist: ['39162411', '36681987', '39162411'] } })
      };
    }
    if (String(url).includes('esummary.fcgi')) {
      return {
        ok: true,
        json: async () => ({
          result: {
            '39162411': {
              title: 'The Transtemporal Isthmus Approach for Insular Glioma Surgery.',
              authors: [{ name: 'Sun G' }],
              fulljournalname: 'Operative Neurosurgery',
              pubdate: '2025',
              articleids: [{ idtype: 'doi', value: '10.1227/ons.0000000000001308' }]
            },
            '36681987': {
              title: 'The transfrontal isthmus approach for insular glioma surgery.',
              authors: [{ name: 'Sun GC' }],
              fulljournalname: 'Journal of Neurosurgery',
              pubdate: '2023',
              articleids: [{ idtype: 'doi', value: '10.3171/2022.8.JNS22923' }]
            }
          }
        })
      };
    }
    if (String(url).includes('efetch.fcgi')) {
      return {
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <PubmedArticleSet>
            <PubmedArticle>
              <MedlineCitation>
                <PMID>39162411</PMID>
                <Article>
                  <Abstract>
                    <AbstractText>Insular glioma surgery approach.</AbstractText>
                  </Abstract>
                </Article>
              </MedlineCitation>
            </PubmedArticle>
          </PubmedArticleSet>`
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const pubmed = await searchPubMed('中国的孙国臣医生是论文作者吗？他的论文和岛叶胶质瘤切除相关吗？', 5, { fetchImpl, planner });

  assert.equal(pubmed.queryInfo.source, 'llm');
  assert.equal(pubmed.results.length, 2);
  assert.equal(pubmed.results[0].pmid, '39162411');
  assert.equal(pubmed.results[1].pmid, '36681987');
  assert.ok(requests.some((url) => decodeURIComponent(url).includes('"Sun GC"[Author]')));
});

test('searchPubMed can execute an already generated search plan without replanning', async () => {
  let plannerCalled = false;
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('esearch.fcgi')) {
      return {
        ok: true,
        json: async () => ({ esearchresult: { idlist: [] } })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const pubmed = await searchPubMed('岛叶胶质瘤的切除方案', 5, {
    fetchImpl,
    planner: async () => {
      plannerCalled = true;
      return {
        pubmedQueries: ['bad planner query']
      };
    },
    searchPlan: {
      originalQuery: '岛叶胶质瘤的切除方案',
      source: 'llm',
      pubmedQueries: ['("insular glioma" OR "insula glioma") AND (resection OR surgery)'],
      pubmedQuery: '("insular glioma" OR "insula glioma") AND (resection OR surgery)',
      tavilyQuery: 'insular glioma resection surgery',
      guidance: '模型生成检索计划。'
    }
  });

  assert.equal(plannerCalled, false);
  assert.equal(pubmed.queryInfo.source, 'llm');
  assert.ok(requests.some((url) => decodeURIComponent(url).includes('insular glioma')));
});
