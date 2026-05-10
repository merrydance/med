const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';

function normalizeChatBaseUrl(baseUrl) {
  const cleaned = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  if (cleaned.includes('openai.com') && !cleaned.endsWith('/v1')) {
    return DEFAULT_BASE_URL;
  }
  return cleaned;
}

function createChatRequestBody({ settings, messages }) {
  const model = settings.customModel || settings.model || DEFAULT_MODEL;
  const body = {
    model,
    messages,
    stream: true
  };

  if (settings.reasoningEffort) {
    body.reasoning_effort = settings.reasoningEffort;
  } else {
    body.temperature = 0.7;
  }

  return body;
}

async function testChatConnection({ settings, fetchImpl = fetch }) {
  if (!settings.apiKey) {
    return {
      ok: false,
      type: 'missing-key',
      message: '请先填写 API Key'
    };
  }

  const baseUrl = normalizeChatBaseUrl(settings.baseUrl);
  const body = createChatRequestBody({
    settings,
    messages: [{ role: 'user', content: 'ping' }]
  });

  try {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        type: 'http-error',
        status: response.status,
        message: `连接失败 (${response.status}): ${errorText}`
      };
    }

    await response.body?.cancel?.();

    return {
      ok: true,
      type: 'ok',
      message: '连接成功'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'network-error',
      message: `网络错误: ${error.message}`
    };
  }
}

function extractSseDeltas(chunk, previousRemainder = '') {
  const buffer = previousRemainder + chunk;
  const events = buffer.split('\n\n');
  let remainder = events.pop() || '';
  const deltas = [];

  if (remainder.trim() === 'data: [DONE]') {
    remainder = '';
  }

  for (const eventBlock of events) {
    const dataLines = eventBlock
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6));

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === '[DONE]') continue;
      try {
        const data = JSON.parse(dataLine);
        const delta =
          data.choices?.[0]?.delta?.content ||
          (data.type === 'response.output_text.delta' ? data.delta : '');
        if (delta) deltas.push(delta);
      } catch {
        // Incomplete SSE JSON stays in remainder only when event is incomplete.
      }
    }
  }

  return { deltas, remainder };
}

module.exports = {
  normalizeChatBaseUrl,
  createChatRequestBody,
  extractSseDeltas,
  testChatConnection
};
