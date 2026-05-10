const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPubMedQuery,
  searchPubMed,
  formatSearchContext
} = require('../../search.js');

test('builds an English PubMed query from common Chinese neurosurgery terms', () => {
  const queryInfo = buildPubMedQuery('胶质母细胞瘤复发治疗进展');

  assert.equal(queryInfo.originalQuery, '胶质母细胞瘤复发治疗进展');
  assert.equal(queryInfo.wasTranslated, true);
  assert.match(queryInfo.pubmedQuery, /glioblastoma/i);
  assert.match(queryInfo.pubmedQuery, /recurrence/i);
  assert.match(queryInfo.pubmedQuery, /treatment|therapy/i);
  assert.match(queryInfo.pubmedQuery, /"Glioblastoma"\[Mesh\]/);
  assert.match(queryInfo.pubmedQuery, /glioblastoma OR glioblastoma\[Title\/Abstract\]/i);
  assert.match(queryInfo.guidance, /检索提示词/);
  assert.match(queryInfo.guidance, /MeSH/);
  assert.doesNotMatch(queryInfo.guidance, /术语词库/);
});

test('builds an English PubMed query for vascular neurosurgery questions', () => {
  const queryInfo = buildPubMedQuery('脑动静脉畸形栓塞并发症');

  assert.equal(queryInfo.wasTranslated, true);
  assert.match(queryInfo.pubmedQuery, /arteriovenous malformation/i);
  assert.match(queryInfo.pubmedQuery, /embolization/i);
  assert.match(queryInfo.pubmedQuery, /complication/i);
  assert.match(queryInfo.pubmedQuery, /"Intracranial Arteriovenous Malformations"\[Mesh\]/);
  assert.match(queryInfo.pubmedQuery, /"Embolization, Therapeutic"\[Mesh\]/);
});

test('builds an English PubMed query for skull base surgical complications', () => {
  const queryInfo = buildPubMedQuery('垂体腺瘤内镜经鼻手术尿崩症');

  assert.equal(queryInfo.wasTranslated, true);
  assert.match(queryInfo.pubmedQuery, /pituitary adenoma/i);
  assert.match(queryInfo.pubmedQuery, /endoscopic endonasal/i);
  assert.match(queryInfo.pubmedQuery, /diabetes insipidus/i);
  assert.match(queryInfo.pubmedQuery, /"Pituitary Neoplasms"\[Mesh\]/);
  assert.match(queryInfo.pubmedQuery, /"Diabetes Insipidus"\[Mesh\]/);
});

test('keeps Chinese fallback transparent when no mapped medical term is found', () => {
  const queryInfo = buildPubMedQuery('少见中文短语');

  assert.equal(queryInfo.wasTranslated, true);
  assert.match(queryInfo.pubmedQuery, /少见中文短语/);
  assert.doesNotMatch(queryInfo.pubmedQuery, /\[Title\/Abstract\]/);
  assert.match(queryInfo.guidance, /建议补充英文疾病、术式或结局词/);
});

test('keeps PubMed ATM available by pairing untagged and Title Abstract terms', () => {
  const queryInfo = buildPubMedQuery('胶质母细胞瘤复发治疗进展');

  assert.match(queryInfo.pubmedQuery, /"Glioblastoma"\[Mesh\]/);
  assert.match(queryInfo.pubmedQuery, /glioblastoma OR glioblastoma\[Title\/Abstract\]/i);
  assert.match(queryInfo.pubmedQuery, /recurrence OR recurrence\[Title\/Abstract\]/i);
  assert.doesNotMatch(queryInfo.guidance, /权威|官方|标准译名/);
});

test('formats PubMed citations with traceable query, PubMed links and DOI links', () => {
  const context = formatSearchContext({
    queryInfo: {
      originalQuery: '胶质母细胞瘤复发治疗进展',
      pubmedQuery: '(glioblastoma OR glioblastoma[Title/Abstract]) AND (recurrence OR recurrence[Title/Abstract])',
      wasTranslated: true,
      guidance: '检测到中文输入，已使用内置检索提示词生成 PubMed 检索式。'
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
  assert.match(context, /内置检索提示词/);
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
