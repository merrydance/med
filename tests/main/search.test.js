const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPubMedQuery,
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
