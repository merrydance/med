const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SEARCH_PLANNER_SYSTEM_PROMPT,
  createSearchPlanner
} = require('../../src-main/searchPlanner.js');

test('search planner prompt protects specific medical and author intent', () => {
  assert.match(SEARCH_PLANNER_SYSTEM_PROMPT, /只输出 JSON/);
  assert.match(SEARCH_PLANNER_SYSTEM_PROMPT, /不得退化为/);
  assert.match(SEARCH_PLANNER_SYSTEM_PROMPT, /surgery OR surgery/);
  assert.match(SEARCH_PLANNER_SYSTEM_PROMPT, /中文姓名/);
  assert.match(SEARCH_PLANNER_SYSTEM_PROMPT, /追问/);
  assert.match(SEARCH_PLANNER_SYSTEM_PROMPT, /PMID|论文/);
});

test('search planner skips model request when API key is missing', async () => {
  const planner = createSearchPlanner({
    settings: { apiKey: '', baseUrl: 'https://api.example.test/v1', model: 'gpt-5.5' },
    fetchImpl: async () => {
      throw new Error('fetch should not run');
    }
  });

  assert.equal(await planner('岛叶胶质瘤'), null);
});

test('search planner sends strict non-streaming JSON planning request', async () => {
  let requestUrl = '';
  let requestInit;
  const planner = createSearchPlanner({
    settings: {
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.test/v1/',
      model: 'gpt-5.5',
      customModel: ''
    },
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"pubmedQueries":["(\\"Sun GC\\"[Author]) AND \\"insular glioma\\""],"tavilyQuery":"Sun GC insular glioma","reasoning":"核验作者与主题"}'
            }
          }]
        })
      };
    }
  });

  const content = await planner('当前追问: 中国的孙国臣医生是论文作者吗？');
  const body = JSON.parse(requestInit.body);

  assert.equal(requestUrl, 'https://api.example.test/v1/chat/completions');
  assert.equal(requestInit.method, 'POST');
  assert.equal(requestInit.headers.Authorization, 'Bearer sk-test');
  assert.equal(body.model, 'gpt-5.5');
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /PubMed 检索式数组/);
  assert.equal(body.messages[1].role, 'user');
  assert.match(body.messages[1].content, /孙国臣/);
  assert.match(content, /Sun GC/);
});

test('search planner surfaces HTTP failures to the caller for transparent fallback', async () => {
  const planner = createSearchPlanner({
    settings: { apiKey: 'sk-test', baseUrl: 'https://api.example.test/v1', model: 'gpt-5.5' },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => 'server_error'
    })
  });

  await assert.rejects(
    () => planner('岛叶胶质瘤'),
    /检索规划失败 \(500\): server_error/
  );
});
