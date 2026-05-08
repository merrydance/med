// ====== 全局状态 ======
const DEFAULT_MODEL = 'gpt-5.5';
let settings = { baseUrl: '', apiKey: '', tavilyKey: '', model: DEFAULT_MODEL, customModel: '', reasoningEffort: '' };
let chats = [];       // [{id, title, messages: [{role, content}], createdAt}]
let currentChatId = null;
let pendingFile = null; // {name, text, pages}
let isStreaming = false;

// ====== 初始化 ======
document.addEventListener('DOMContentLoaded', async () => {
  settings = await window.electronAPI.getSettings();
  // 修复旧版保存的无效模型名
  if (!settings.model) settings.model = DEFAULT_MODEL;
  chats = await window.electronAPI.listChats();
  applySettings();
  renderChatList();

  // 如果没有 API Key，自动弹设置
  if (!settings.apiKey || !settings.baseUrl) document.getElementById('settingsOverlay').classList.remove('hidden');
});

// ====== 设置 ======
const $settingsOverlay = document.getElementById('settingsOverlay');
const $baseUrl = document.getElementById('baseUrl');
const $apiKey = document.getElementById('apiKey');
const $modelSelect = document.getElementById('modelSelect');
const $customModel = document.getElementById('customModel');

document.getElementById('settingsBtn').onclick = () => {
  $baseUrl.value = settings.baseUrl;
  $apiKey.value = settings.apiKey;
  $modelSelect.value = settings.model;
  $customModel.value = settings.customModel || '';
  document.getElementById('tavilyKey').value = settings.tavilyKey || '';
  document.getElementById('reasoningEffort').value = settings.reasoningEffort || '';
  $settingsOverlay.classList.remove('hidden');
};

document.getElementById('cancelSettings').onclick = () => $settingsOverlay.classList.add('hidden');

document.getElementById('saveSettings').onclick = async () => {
  settings.baseUrl = $baseUrl.value.trim().replace(/\/+$/, '');
  settings.apiKey = $apiKey.value.trim();
  settings.model = $modelSelect.value || DEFAULT_MODEL;
  settings.customModel = $customModel.value.trim();
  settings.tavilyKey = document.getElementById('tavilyKey').value.trim();
  settings.reasoningEffort = document.getElementById('reasoningEffort').value;
  await window.electronAPI.saveSettings(settings);
  applySettings();
  $settingsOverlay.classList.add('hidden');
};

document.getElementById('toggleKeyBtn').onclick = () => {
  const inp = $apiKey;
  inp.type = inp.type === 'password' ? 'text' : 'password';
};

function applySettings() {
  const model = settings.customModel || settings.model;
  const effort = settings.reasoningEffort ? ` (${settings.reasoningEffort})` : '';
  document.getElementById('modelBadge').textContent = model + effort;
}

// ====== 对话管理 ======
function getActiveModel() {
  return settings.customModel || settings.model || DEFAULT_MODEL;
}

function createChat() {
  const chat = {
    id: Date.now().toString(),
    title: '新对话',
    messages: [],
    createdAt: new Date().toISOString(),
  };
  chats.unshift(chat);
  currentChatId = chat.id;
  renderChatList();
  renderMessages();
  saveChats();
  return chat;
}

function getCurrentChat() {
  if (!currentChatId) return null;
  return chats.find(c => c.id === currentChatId);
}

function renderChatList() {
  const $list = document.getElementById('chatList');
  $list.innerHTML = chats.map(c => `
    <div class="chat-item ${c.id === currentChatId ? 'active' : ''}" data-id="${c.id}">
      <span>${escapeHtml(c.title)}</span>
      <button class="delete-chat" data-id="${c.id}" title="删除">✕</button>
    </div>
  `).join('');

  $list.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-chat')) return;
      currentChatId = el.dataset.id;
      renderChatList();
      renderMessages();
    });
  });

  $list.querySelectorAll('.delete-chat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chats = chats.filter(c => c.id !== btn.dataset.id);
      if (currentChatId === btn.dataset.id) {
        currentChatId = chats[0]?.id || null;
      }
      renderChatList();
      renderMessages();
      saveChats();
    });
  });
}

async function saveChats() {
  await window.electronAPI.saveChats(chats);
}

// 防抖保存，避免频繁写磁盘
let _saveTimer = null;
function debouncedSaveChats() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveChats(), 1000);
}

document.getElementById('newChatBtn').onclick = () => createChat();
document.getElementById('clearAllBtn').onclick = () => {
  if (!confirm('确定清除所有对话历史？此操作不可撤销。')) return;
  chats = [];
  currentChatId = null;
  renderChatList();
  renderMessages();
  saveChats();
};

// ====== 消息渲染 ======
function renderMessages() {
  const $messages = document.getElementById('messages');
  const chat = getCurrentChat();

  if (!chat || chat.messages.length === 0) {
    $messages.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">🧠</div>
        <h2>神经外科 AI 科研助手</h2>
        <p>您好，我是您的科研助手。您可以：</p>
        <div class="welcome-cards">
          <div class="card" data-prompt="总结近3年经鼻蝶入路切除垂体腺瘤的手术技巧改进">
            📚 文献综述<small>总结特定术式的最新进展</small>
          </div>
          <div class="card" data-prompt="请帮我分析这篇论文的方法学和统计分析是否合理">
            📄 论文分析<small>上传PDF进行深度分析</small>
          </div>
          <div class="card" data-prompt="IDH突变型胶质瘤的最新WHO分类标准及预后差异">
            🔬 知识查询<small>查询专业医学知识</small>
          </div>
        </div>
      </div>`;
    // 绑定卡片点击
    $messages.querySelectorAll('.card').forEach(card => {
      card.onclick = () => {
        document.getElementById('userInput').value = card.dataset.prompt;
        document.getElementById('userInput').focus();
      };
    });
    return;
  }

  $messages.innerHTML = chat.messages.map(m => {
    if (m.role === 'user') {
      return `<div class="message user">
        <div class="avatar">👤</div>
        <div class="bubble">${escapeHtml(m.content)}</div>
      </div>`;
    }
    return `<div class="message ai">
      <div class="avatar">🧠</div>
      <div class="bubble">${renderMarkdown(m.content)}</div>
    </div>`;
  }).join('');

  $messages.scrollTop = $messages.scrollHeight;
}

function appendStreamingMessage() {
  const $messages = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ai';
  div.id = 'streaming-msg';
  div.innerHTML = `
    <div class="avatar">🧠</div>
    <div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
  `;
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

function updateStreamingMessage(text) {
  const bubble = document.querySelector('#streaming-msg .bubble');
  if (bubble) {
    bubble.innerHTML = renderMarkdown(text);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  }
}

function finalizeStreamingMessage() {
  const el = document.getElementById('streaming-msg');
  if (el) el.removeAttribute('id');
}

// ====== 文件上传 ======
document.getElementById('uploadBtn').onclick = async () => {
  const filePath = await window.electronAPI.openFileDialog();
  if (!filePath) return;
  try {
    pendingFile = await window.electronAPI.readFile(filePath);
    showFilePreview();
  } catch (err) {
    alert('文件读取失败: ' + err.message);
  }
};

function showFilePreview() {
  const $preview = document.getElementById('filePreview');
  if (!pendingFile) {
    $preview.classList.add('hidden');
    return;
  }
  const sizeInfo = pendingFile.pages > 1 ? `${pendingFile.pages} 页` : '';
  const charInfo = `${pendingFile.text.length} 字符`;
  $preview.classList.remove('hidden');
  $preview.innerHTML = `
    📄 <strong>${escapeHtml(pendingFile.name)}</strong>
    <span style="color:var(--text-secondary); font-size:11px">${sizeInfo} ${charInfo}</span>
    <button class="remove-file" title="移除">✕</button>
  `;
  $preview.querySelector('.remove-file').onclick = () => {
    pendingFile = null;
    $preview.classList.add('hidden');
  };
}

// ====== 发送消息 ======
const $input = document.getElementById('userInput');
const $sendBtn = document.getElementById('sendBtn');

$input.addEventListener('input', () => {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 150) + 'px';
});

$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

$sendBtn.onclick = () => sendMessage();

async function sendMessage() {
  const text = $input.value.trim();
  if ((!text && !pendingFile) || isStreaming) return;

  if (!settings.apiKey || !settings.baseUrl) {
    document.getElementById('settingsOverlay').classList.remove('hidden');
    return;
  }

  // 确保有对话
  if (!currentChatId) createChat();
  const chat = getCurrentChat();

  // 构建用户消息
  let userContent = text;
  if (pendingFile) {
    const truncated = pendingFile.text.slice(0, 30000); // 限制长度
    userContent = `[上传文档: ${pendingFile.name}]\n\n---\n文档内容:\n${truncated}\n---\n\n${text || '请分析这篇文档。'}`;
  }

  chat.messages.push({ role: 'user', content: userContent });

  // 更新标题 (第一条消息)
  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 30) || pendingFile?.name || '新对话';
    renderChatList();
  }

  // 清空输入
  $input.value = '';
  $input.style.height = 'auto';
  pendingFile = null;
  document.getElementById('filePreview').classList.add('hidden');

  renderMessages();
  appendStreamingMessage();

  // 构建系统提示
  let systemPrompt = buildSystemPrompt();

  let searchContext = '';
  // 联网搜索: 若开启则先搜索再注入上下文
  const skillSearch = document.getElementById('skillSearch').checked;
  if (skillSearch && text) {
    const hasTavily = !!settings.tavilyKey;
    const statusMsg = hasTavily
      ? '🔍 正在搜索 PubMed + 网络...'
      : '🔍 正在搜索 PubMed...（未配置 Tavily Key，无法搜索网页）';
    updateStreamingMessage(statusMsg);

    let pubmedResults = null;
    let tavilyResults = null;
    try {
      [pubmedResults, tavilyResults] = await Promise.all([
        searchPubMed(text),
        hasTavily ? searchTavily(text, settings.tavilyKey) : null,
      ]);
    } catch (e) {
      console.error('搜索出错:', e);
    }

    // 显示搜索状态
    const pubmedCount = pubmedResults?.length || 0;
    const tavilyCount = tavilyResults?.results?.length || 0;
    let searchStatus = `🔍 搜索完成: PubMed ${pubmedCount} 篇`;
    if (hasTavily) searchStatus += `, 网页 ${tavilyCount} 条`;
    if (pubmedCount === 0 && tavilyCount === 0) searchStatus += ' (未找到结果)';
    updateStreamingMessage(searchStatus + '\n\n⏳ 正在分析...');

    searchContext = formatSearchContext(pubmedResults, tavilyResults);
    if (!searchContext && !hasTavily) {
      searchContext = '\n\n[注意：未配置 Tavily Key 且 PubMed 未找到结果。请基于自身知识回答，并提醒用户配置 Tavily Key 以搜索网页。]';
    }
  }

  // 构建消息列表 (带上下文记忆，限制最近20条防止token溢出)
  const recentMessages = chat.messages.slice(-20);
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m, index) => {
      // 在最后一条用户消息中追加搜索上下文，防止部分深度推理模型忽略 system prompt
      if (index === recentMessages.length - 1 && m.role === 'user' && searchContext) {
        return { 
          role: m.role, 
          content: m.content + `\n\n=== 实时检索结果 ===\n请务必优先基于以下最新搜索结果来回答用户问题，并引用相关信息源：\n${searchContext}` 
        };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  // 流式请求 (带自动重试)
  isStreaming = true;
  $sendBtn.disabled = true;
  let fullResponse = '';
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    fullResponse = '';
    try {
      const model = getActiveModel();
      const url = `${settings.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          ...(settings.reasoningEffort
            ? { reasoning_effort: settings.reasoningEffort }
            : { temperature: 0.7 }),
          stream: true,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API 错误 (${response.status}): ${err}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          const lines = part.split('\n');
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('data: ')) dataStr += line.slice(6);
          }
          if (!dataStr || dataStr.trim() === '[DONE]') continue;
          try {
            const json = JSON.parse(dataStr);
            if (json.type === 'response.output_text.delta' && json.delta) {
              fullResponse += json.delta;
              updateStreamingMessage(fullResponse);
            } else if (json.choices?.[0]?.delta?.content) {
              fullResponse += json.choices[0].delta.content;
              updateStreamingMessage(fullResponse);
            }
          } catch {}
        }
      }
      break; // 成功则跳出重试循环
    } catch (err) {
      const isNetworkError = err.message.includes('network') || err.message.includes('ERR_NETWORK');
      if (isNetworkError && attempt < MAX_RETRIES) {
        const delay = attempt * 2000;
        updateStreamingMessage(`⏳ 网络波动，${delay / 1000}秒后自动重试 (第${attempt}/${MAX_RETRIES}次)...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      fullResponse = `❌ 请求失败: ${err.message}\n\n${isNetworkError ? '网络不稳定，请检查网络连接后重试。' : '请检查设置中的 API 地址和 Key 是否正确。'}`;
      updateStreamingMessage(fullResponse);
    }
  }

  finalizeStreamingMessage();
  // 只保存有内容的回复
  if (fullResponse) {
    chat.messages.push({ role: 'assistant', content: fullResponse });
  }
  isStreaming = false;
  $sendBtn.disabled = false;
  debouncedSaveChats();
}

// ====== 系统提示构建 ======
function buildSystemPrompt() {
  const skillNeuro = document.getElementById('skillNeuro').checked;
  const skillDoc = document.getElementById('skillDoc').checked;
  const skillSearch = document.getElementById('skillSearch').checked;

  let prompt = '你是一位专业的AI科研助手。';

  if (skillNeuro) {
    prompt = `你是一位资深的神经外科科研顾问，拥有神经外科博士学位和20年以上临床与科研经验。
你精通以下领域：
- 脑肿瘤（胶质瘤、脑膜瘤、垂体瘤、听神经瘤等）的诊断、手术和预后
- 脑血管疾病（动脉瘤、AVM、海绵状血管瘤）的手术治疗
- 功能神经外科（癫痫外科、DBS、三叉神经痛）
- WHO CNS肿瘤分类（最新版）
- 各种手术入路的选择与比较
- 神经影像学分析
- 临床试验设计和统计学方法

你的回答应当：
1. 基于循证医学证据，引用权威文献（如JNS, Neurosurgery, Lancet Neurology等）
2. 使用准确的医学术语，同时给出中文解释
3. 对手术相关问题，说明入路选择、关键步骤、并发症风险
4. 对统计数据给出具体数值（如GTR率、mRS评分、并发症率等）
5. 保持学术严谨性，对不确定的内容明确标注`;
  }

  if (skillDoc) {
    prompt += `\n\n当用户上传文档时，你应当：
1. 先总结文档核心内容
2. 分析研究方法和统计学方法是否合理
3. 指出潜在的方法学缺陷（样本量、随访时长、选择偏倚等）
4. 提取关键数据（手术结局、生存数据、并发症率等）
5. 与同领域其他研究进行对比讨论`;
  }

  if (skillSearch) {
    prompt += `\n\n用户可能询问最新的研究进展和临床指南更新。请基于你的训练知识尽可能提供最新信息，并建议用户查阅的具体数据库和期刊。`;
  }

  prompt += '\n\n请用中文回答，除非用户使用英文提问。使用Markdown格式输出，善用标题、列表、表格来组织信息。';
  return prompt;
}

// ====== 工具函数 ======
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return '';
  try {
    return marked.parse(text);
  } catch {
    return escapeHtml(text);
  }
}
