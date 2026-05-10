const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeChatBaseUrl,
  createChatRequestBody,
  extractSseDeltas,
  testChatConnection
} = require('../../src-main/api.js');

test('normalizes OpenAI base URLs to the v1 chat API root', () => {
  assert.equal(normalizeChatBaseUrl('https://api.openai.com'), 'https://api.openai.com/v1');
  assert.equal(normalizeChatBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.equal(normalizeChatBaseUrl('https://example.test/custom/'), 'https://example.test/custom');
});

test('builds chat request body with custom model and reasoning effort', () => {
  const body = createChatRequestBody({
    settings: {
      model: 'gpt-4o',
      customModel: 'gpt-5.5',
      reasoningEffort: 'high'
    },
    messages: [{ role: 'user', content: 'hello' }]
  });

  assert.deepEqual(body, {
    model: 'gpt-5.5',
    messages: [{ role: 'user', content: 'hello' }],
    stream: true,
    reasoning_effort: 'high'
  });
});

test('uses temperature when no reasoning effort is configured', () => {
  const body = createChatRequestBody({
    settings: {
      model: 'gpt-4o',
      customModel: '',
      reasoningEffort: ''
    },
    messages: [{ role: 'user', content: 'hello' }]
  });

  assert.deepEqual(body, {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hello' }],
    stream: true,
    temperature: 0.7
  });
});

test('chat request body can override global model settings with conversation settings', () => {
  const body = createChatRequestBody({
    settings: {
      model: 'gpt-4o',
      customModel: '',
      reasoningEffort: 'medium'
    },
    messages: [{ role: 'user', content: 'hello' }]
  });

  assert.equal(body.model, 'gpt-4o');
  assert.equal(body.reasoning_effort, 'medium');
});

test('extracts deltas from OpenAI chat and Responses API SSE chunks', () => {
  const chunk = [
    'data: {"choices":[{"delta":{"content":"你好"}}]}',
    '',
    'data: {"type":"response.output_text.delta","delta":"世界"}',
    '',
    'data: [DONE]',
    ''
  ].join('\n');

  assert.deepEqual(extractSseDeltas(chunk), {
    deltas: ['你好', '世界'],
    remainder: ''
  });
});

test('keeps incomplete SSE fragments as remainder', () => {
  const chunk = 'data: {"choices":[{"delta":{"content":"半截';

  assert.deepEqual(extractSseDeltas(chunk), {
    deltas: [],
    remainder: chunk
  });
});

test('connection test reports missing API key before network access', async () => {
  const result = await testChatConnection({
    settings: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' },
    fetchImpl: async () => {
      throw new Error('fetch should not run');
    }
  });

  assert.deepEqual(result, {
    ok: false,
    type: 'missing-key',
    message: '请先填写 API Key'
  });
});

test('connection test reports HTTP errors with response body', async () => {
  const result = await testChatConnection({
    settings: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-bad', model: 'gpt-4o' },
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer sk-bad');
      return {
        ok: false,
        status: 401,
        text: async () => 'invalid_api_key'
      };
    }
  });

  assert.deepEqual(result, {
    ok: false,
    type: 'http-error',
    status: 401,
    message: '连接失败 (401): invalid_api_key'
  });
});

test('connection test sends the same streaming chat shape as real conversations', async () => {
  let requestBody;
  let cancelled = false;
  const result = await testChatConnection({
    settings: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o' },
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        body: {
          cancel: async () => {
            cancelled = true;
          }
        },
        text: async () => ''
      };
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requestBody, {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'ping' }],
    stream: true,
    temperature: 0.7
  });
  assert.equal(cancelled, true);
});

test('connection test reports network errors separately from API errors', async () => {
  const result = await testChatConnection({
    settings: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o' },
    fetchImpl: async () => {
      throw new Error('Failed to fetch');
    }
  });

  assert.deepEqual(result, {
    ok: false,
    type: 'network-error',
    message: '网络错误: Failed to fetch'
  });
});
