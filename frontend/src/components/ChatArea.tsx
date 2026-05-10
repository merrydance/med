import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingStore } from '../store/settingStore'
import { MarkdownViewer } from './MarkdownViewer'
import { APP_TITLE } from '../constants/app'
import type { ChatMessage } from '../types/chat'
import type { DocumentParseMode, FileReadResult } from '../types/env'

const MODEL_OPTIONS = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o-mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'o3', label: 'o3' },
  { value: 'o4-mini', label: 'o4-mini' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
]

const SEARCH_CONTEXT_MESSAGE_LIMIT = 4
const SEARCH_CONTEXT_MAX_CHARS = 360
const STREAM_FLUSH_INTERVAL_MS = 50

type FileQueueItem = {
  id: string
  path: string
  name: string
  status: 'waiting' | 'parsing' | 'done' | 'error'
  result?: FileReadResult
  message?: string
}

export function ChatArea() {
  const {
    currentChatId,
    currentMessages,
    draftModel,
    draftReasoningEffort,
    createNewChat,
    addMessage,
    appendAssistantStream,
    finalizeStream,
    setStreaming,
    updateChatModelConfig,
    isStreaming
  } = useChatStore()
  const { tavilyKey } = useSettingStore()
  const [inputText, setInputText] = useState('')
  const [pendingFile, setPendingFile] = useState<FileReadResult | null>(null)
  const [enableDoc, setEnableDoc] = useState(true)
  const [enableSearch, setEnableSearch] = useState(false)
  const [enableNeuro, setEnableNeuro] = useState(true)
  const [enableAdvancedParse, setEnableAdvancedParse] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const [fileStatus, setFileStatus] = useState('')
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([])
  const messagesRef = useRef<HTMLDivElement>(null)
  const isUserScrollingRef = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingChatIdRef = useRef<string | null>(null)
  const streamBufferRef = useRef('')
  const streamFlushTimerRef = useRef<number | null>(null)
  const streamBufferChatIdRef = useRef<string | null>(null)

  const flushStreamBuffer = useCallback(() => {
    const content = streamBufferRef.current
    const chatId = streamBufferChatIdRef.current || streamingChatIdRef.current || undefined
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current)
      streamFlushTimerRef.current = null
    }
    if (!content) return
    streamBufferRef.current = ''
    streamBufferChatIdRef.current = null
    appendAssistantStream(content, chatId)
  }, [appendAssistantStream])

  const appendBufferedAssistantStream = useCallback((chunk: string, chatId?: string) => {
    streamBufferRef.current += chunk
    streamBufferChatIdRef.current = chatId || streamingChatIdRef.current
    if (streamFlushTimerRef.current !== null) return

    streamFlushTimerRef.current = window.setTimeout(() => {
      flushStreamBuffer()
    }, STREAM_FLUSH_INTERVAL_MS)
  }, [flushStreamBuffer])

  const appendToAssistantBubble = useCallback((content: string, chatId?: string) => {
    const { currentChatId: latestChatId, currentMessages: latestMessages, chats } = useChatStore.getState()
    const targetChatId = chatId || latestChatId || undefined
    const targetMessages = targetChatId === latestChatId
      ? latestMessages
      : chats.find((chat) => chat.id === targetChatId)?.messages || []
    const lastMsg = targetMessages[targetMessages.length - 1]
    if (lastMsg?.role === 'assistant') {
      appendAssistantStream(content, targetChatId)
      return
    }

    addMessage({
      id: Math.random().toString(36).substring(2, 15),
      role: 'system',
      content,
      createdAt: Date.now()
    }, targetChatId)
  }, [addMessage, appendAssistantStream])

  // ====== 滚动锁定逻辑 (Task 4.1.1) ======

  const isNearBottom = useCallback(() => {
    const el = messagesRef.current
    if (!el) return true
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 30
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      isUserScrollingRef.current = false
      setShowScrollBtn(false)
    }
  }, [])

  // 监听用户主动滚动（向上时锁定）
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (isStreaming && e.deltaY < 0) {
        isUserScrollingRef.current = true
        setShowScrollBtn(true)
      }
    }

    const handleScroll = () => {
      if (isNearBottom()) {
        isUserScrollingRef.current = false
        setShowScrollBtn(false)
      } else if (isStreaming) {
        setShowScrollBtn(true)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isStreaming && ['ArrowUp', 'PageUp'].includes(e.key)) {
        isUserScrollingRef.current = true
        setShowScrollBtn(true)
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: true })
    el.addEventListener('scroll', handleScroll, { passive: true })
    el.addEventListener('keydown', handleKeyDown)

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('scroll', handleScroll)
      el.removeEventListener('keydown', handleKeyDown)
    }
  }, [isStreaming, isNearBottom])

  // 流式输出时自动滚动（除非用户锁定了）
  useEffect(() => {
    if (!isUserScrollingRef.current) {
      scrollToBottom()
    }
  }, [currentMessages, scrollToBottom])

  // ====== IPC 事件绑定 ======

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onChatDelta((chunk) => {
        appendBufferedAssistantStream(chunk, streamingChatIdRef.current || undefined)
      })
      window.electronAPI.onChatComplete(async () => {
        const targetChatId = streamingChatIdRef.current || undefined
        flushStreamBuffer()
        await finalizeStream(targetChatId)
        streamingChatIdRef.current = null
        setStreaming(false)
      })
      window.electronAPI.onChatError((errMsg) => {
        const targetChatId = streamingChatIdRef.current || undefined
        flushStreamBuffer()
        streamingChatIdRef.current = null
        setStreaming(false)
        setIsPreparing(false)
        appendToAssistantBubble(`\n\n错误: ${errMsg}`, targetChatId)
      })
    }
    return () => {
      flushStreamBuffer()
    }
  }, [appendBufferedAssistantStream, finalizeStream, setStreaming, appendToAssistantBubble, flushStreamBuffer])

  // ====== 发送 ======

  const buildSystemPrompt = () => {
    const baseRules = `你是严谨的医学科研 AI 助手。必须以真实、可追溯、保守的医学证据为边界。
硬性规则：
- 不得编造 PMID、DOI、指南名称、临床试验名称、样本量、P 值、HR、OR、RR、药物剂量、适应证、禁忌证或统计结论。
- 引用 PubMed 文献时必须给出 PMID 和 PubMed 链接；有 DOI 时附 DOI 链接。引用指南时必须给出发布机构、年份和原始链接。
- 若检索结果或上传文档中没有足够依据，必须明确说“未检索到足够证据”或“当前材料不足以支持该结论”，不得用模型记忆补造来源。
- 区分“检索证据”“上传文档证据”“模型背景知识”和“推断”。推断必须标注为推断。
- 不得把模型背景知识包装成检索证据或上传文档证据；没有出现在检索结果或上传文档中的来源，不能作为可追踪引用列出。
- 医疗建议仅作科研和临床决策辅助，不能替代医生判断；涉及诊疗需说明适用前提、风险、禁忌和不确定性。
- 默认使用中文，必须使用 Markdown 分层排版，让医生能快速扫读重点。
排版硬性规则：
- 除非用户只要求一句话回答，否则必须使用二级标题组织内容，优先使用以下标题：## 先说结论、## 分析依据、## 下一步建议、## 风险信号、## 可追踪引用。
- “先说结论”必须放在最前，使用 1-3 条短句或项目符号，直接回答问题并标明证据是否充分。
- 多个诊断方向、治疗方案、研究发现或建议必须使用项目符号或表格；不要把多个诊断方向、证据和建议挤在一个无标题长段落中。
- 每个自然段尽量不超过 4 行；重要限定词使用加粗，例如 **证据不足**、**需要急诊**、**推断**。
- 如果没有可追踪来源，仍保留“## 可追踪引用”标题，并明确写“未检索到足够直接证据，不能编造 PMID、DOI 或指南链接”。
医学证据类回答结构：
当问题涉及诊疗决策、文献解读、指南推荐、疗效比较、风险评估、用药、手术策略或证据等级判断时，优先使用以下结构：
1. 简要结论：先给出直接回答，并标明证据是否充分。
2. 证据依据：按“检索证据 / 上传文档证据 / 模型背景知识 / 推断”分层说明。
3. 临床边界：涉及诊疗、用药、手术策略或指南推荐时，列出适用前提、主要风险和不确定性。
4. 可追踪引用：回答末尾列出真实 PMID、PubMed 链接、DOI 或指南原文链接；没有可追踪来源时明确说明。
当用户要求写作、润色、翻译、头脑风暴或研究设计构思时，可以采用更自然的任务格式，但仍必须遵守不编造来源、不夸大证据、不把推断包装成事实的规则。`

    if (!enableNeuro) return baseRules

    return `${baseRules}
专业角色：
- 你是一位资深神经外科科研顾问，熟悉脑肿瘤、脑血管病、功能神经外科、神经重症、医学统计与论文写作。
- 优先采用 PubMed、指南、临床试验和高质量综述；网络搜索结果只能作为补充线索。`
  }

  const buildUserContent = async (text: string) => {
    if (!enableDoc || !pendingFile) return text

    const query = text || '请分析这篇文档。'

    if (window.electronAPI?.selectDocumentContext) {
      setFileStatus('正在从文档中检索最相关的片段...')
      const result = await window.electronAPI.selectDocumentContext({
        name: pendingFile.name,
        text: pendingFile.text,
        query
      })

      if (result.mode === 'rag') {
        setFileStatus(`已选取 ${result.chunks.length} 个相关片段，正在发送给模型。`)
        return [
          `[上传文档: ${pendingFile.name}]`,
          `本地 RAG 已从 ${result.totalChunks} 个片段中选取 ${result.chunks.length} 个相关片段（原文 ${result.originalChars.toLocaleString()} 字符，入模 ${result.selectedChars.toLocaleString()} 字符）。`,
          '',
          '---',
          '相关文档片段:',
          result.context,
          '---',
          '',
          query
        ].join('\n')
      }

      setFileStatus('文档较短，已准备全文发送给模型。')
      return `[上传文档: ${pendingFile.name}]\n\n---\n文档内容:\n${result.context}\n---\n\n${query}`
    }

    const truncated = pendingFile.text.slice(0, 30000)
    return `[上传文档: ${pendingFile.name}]\n\n---\n文档内容:\n${truncated}\n---\n\n${query}`
  }

  const buildContextualSearchQuery = (query: string) => {
    const trimmedQuery = query.trim()
    const recentConversationMessages = currentMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-SEARCH_CONTEXT_MESSAGE_LIMIT)
    const topicSeed = recentConversationMessages.find((message) => message.role === 'user')?.content
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
    const recentMessages = recentConversationMessages
      .map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.content.replace(/\s+/g, ' ').trim()}`)
      .filter((content) => content.length > 3)
      .join('\n')
      .slice(0, SEARCH_CONTEXT_MAX_CHARS)

    if (!recentMessages) return trimmedQuery
    return [
      `当前追问: ${trimmedQuery}`,
      `上文主题: ${topicSeed || recentMessages}`,
      `最近对话: ${recentMessages}`,
      '请围绕上文主题补全省略对象，生成医学文献检索。'
    ].join('\n')
  }

  const getSearchContext = async (query: string, chatId: string) => {
    if (!enableSearch || !query.trim() || !window.electronAPI) return ''

    const sourceLabel = tavilyKey ? 'PubMed + 网络' : 'PubMed'
    if (/[\u3400-\u9fff]/.test(query)) {
      appendAssistantStream('PubMed 对英文检索词和 MeSH/ATM 更友好；已将中文问题交给模型规划 PubMed 检索式，结果仍需结合原文核验。\n\n', chatId)
    }
    appendAssistantStream(`正在搜索 ${sourceLabel}...\n\n`, chatId)

    const searchQuery = buildContextualSearchQuery(query)
    const context = await window.electronAPI.searchTavily(searchQuery)
    if (!context) {
      appendAssistantStream('未检索到可用结果，继续基于已有上下文回答。\n\n', chatId)
      return ''
    }

    appendAssistantStream('搜索完成，正在结合检索结果分析...\n\n', chatId)
    return `\n\n=== 实时检索结果 ===\n请优先结合以下最新检索结果回答，并在回答末尾列出真实引用链接。若结果不足，请明确说明未检索到足够证据，不能编造引用：\n${context}`
  }

  const getFileNameFromPath = (filePath: string) => {
    return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath
  }

  const describeParsedFile = (file: FileReadResult) => {
    const warning = file.warnings?.[0]
    if (warning) return warning
    if (file.provider === 'docling') return '高级解析完成，已保留更完整的段落和表格文本。'
    if (file.provider === 'pdf-parse') return '兼容解析完成'
    return '文档已读取'
  }

  const getParseStatusHint = () => {
    if (enableAdvancedParse) {
      return '高级解析尝试已开启，可能需要更久；如果本机未安装 Docling、超时或失败，会自动切换到兼容解析。'
    }
    return '正在使用快速兼容解析读取 PDF/TXT/MD，通常几秒内完成。'
  }

  const handleUpload = async () => {
    if (!window.electronAPI || isStreaming || isParsingFile) return

    try {
      let filePaths: string[] = []
      if (window.electronAPI.openFileDialogs) {
        const selectedPaths = await window.electronAPI.openFileDialogs()
        if (Array.isArray(selectedPaths) && selectedPaths.length) filePaths = selectedPaths
      }
      if (!filePaths.length) {
        const filePath = await window.electronAPI.openFileDialog()
        if (filePath) filePaths = [filePath]
      }
      if (!filePaths.length) return

      setIsParsingFile(true)
      const parseMode: DocumentParseMode = enableAdvancedParse ? 'advanced' : 'fast'
      setFileStatus(getParseStatusHint())

      const initialQueue = filePaths.map((filePath, index) => ({
        id: `${Date.now()}-${index}`,
        path: filePath,
        name: getFileNameFromPath(filePath),
        status: 'waiting' as const,
      }))
      setFileQueue(initialQueue)

      for (const item of initialQueue) {
        setFileQueue((queue) => queue.map((queued) => (
          queued.id === item.id ? { ...queued, status: 'parsing' } : queued
        )))

        try {
          const file = await window.electronAPI.readFile(item.path, { mode: parseMode })
          setPendingFile(file)
          setEnableDoc(true)
          setFileQueue((queue) => queue.map((queued) => (
            queued.id === item.id
              ? { ...queued, name: file.name, status: 'done', result: file, message: describeParsedFile(file) }
              : queued
          )))
          setFileStatus(filePaths.length > 1 ? `文档队列 ${initialQueue.indexOf(item) + 1}/${initialQueue.length}` : describeParsedFile(file))
        } catch (error) {
          const message = error instanceof Error ? error.message : '文件读取失败'
          setFileQueue((queue) => queue.map((queued) => (
            queued.id === item.id ? { ...queued, status: 'error', message } : queued
          )))
          setFileStatus(message)
        }
      }

      const completed = initialQueue.length
      if (completed > 1) setFileStatus(`文档队列 ${completed}/${completed}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件读取失败'
      setFileStatus('')
      addMessage({
        id: Math.random().toString(36).substring(2, 15),
        role: 'system',
        content: `错误: ${message}`,
        createdAt: Date.now()
      })
    } finally {
      setIsParsingFile(false)
    }
  }

  const handleSend = async () => {
    const trimmedInput = inputText.trim()
    if ((!trimmedInput && !pendingFile) || isStreaming || isPreparing || isParsingFile) return

    let targetChatId = currentChatId
    if (!targetChatId) {
      const chat = await createNewChat({
        model: draftModel,
        reasoningEffort: draftReasoningEffort
      })
      targetChatId = chat.id
    }
    if (!targetChatId) return

    const userContent = await buildUserContent(trimmedInput)

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 15),
      role: 'user',
      content: userContent,
      createdAt: Date.now()
    }

    addMessage(userMsg, targetChatId)
    setInputText('')
    setPendingFile(null)
    setFileStatus('')
    isUserScrollingRef.current = false

    const aiMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 15),
      role: 'assistant',
      content: '',
      createdAt: Date.now()
    }
    addMessage(aiMsg, targetChatId)
    streamingChatIdRef.current = targetChatId
    setStreaming(true)
    setIsPreparing(true)

    if (window.electronAPI) {
      let searchContext = ''
      try {
        searchContext = await getSearchContext(trimmedInput || pendingFile?.name || '', targetChatId)
      } catch (error) {
        const message = error instanceof Error ? error.message : '搜索失败'
        appendAssistantStream(`搜索失败：${message}\n\n`, targetChatId)
      }

      setIsPreparing(false)

      const settingsForChat = {
        model: draftModel,
        customModel: '',
        reasoningEffort: draftReasoningEffort
      }

      const messagesPayload = [
        { role: 'system' as const, content: buildSystemPrompt() },
        ...currentMessages.slice(-20).map(m => ({
          role: m.role === 'system' ? 'assistant' as const : m.role,
          content: m.content
        })),
        {
          role: 'user' as const,
          content: userMsg.content + searchContext
        }
      ]
      await window.electronAPI.chat({ messages: messagesPayload, settings: settingsForChat })
    } else {
      setIsPreparing(false)
      setTimeout(() => {
        appendAssistantStream('（网页版模拟）**Markdown 渲染**已就绪！\n\n| 功能 | 状态 |\n|---|---|\n| 代码高亮 | ✅ |\n| XSS 过滤 | ✅ |\n| 表格横向滚动 | ✅ |\n\n```python\nprint("Hello, Neurosurgery!")\n```', targetChatId)
        streamingChatIdRef.current = null
        setStreaming(false)
      }, 800)
    }
  }

  const handleModelChange = (model: string) => {
    updateChatModelConfig(currentChatId, {
      model,
      reasoningEffort: draftReasoningEffort
    })
  }

  const handleReasoningChange = (reasoningEffort: string) => {
    updateChatModelConfig(currentChatId, {
      model: draftModel,
      reasoningEffort
    })
  }

  const resizeComposerInput = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`
  }, [])

  useEffect(() => {
    resizeComposerInput()
  }, [inputText, resizeComposerInput])

  const renderToolToggles = () => (
    <div className="chat-toolbar">
      <label className={`tool-toggle ${enableDoc ? 'active' : ''}`}>
        <input
          type="checkbox"
          checked={enableDoc}
          onChange={(e) => setEnableDoc(e.target.checked)}
        />
        文档分析
      </label>
      <label className={`tool-toggle ${enableNeuro ? 'active' : ''}`}>
        <input
          type="checkbox"
          checked={enableNeuro}
          onChange={(e) => setEnableNeuro(e.target.checked)}
        />
        神经外科模式
      </label>
      <label className={`tool-toggle ${enableSearch ? 'active' : ''}`}>
        <input
          type="checkbox"
          checked={enableSearch}
          onChange={(e) => setEnableSearch(e.target.checked)}
        />
        联网搜索
      </label>
    </div>
  )

  const renderComposer = (variant: 'welcome' | 'dock') => (
    <>
      {pendingFile && (
        <div className="file-preview-bar">
          <div className="file-preview-main">
            <span className="file-preview-name">{pendingFile.name}</span>
            <span className="file-preview-meta">
              {pendingFile.provider === 'docling' ? '高级解析 · ' : ''}
              {pendingFile.provider === 'pdf-parse' ? '兼容解析 · ' : ''}
              {pendingFile.pages > 1 ? `${pendingFile.pages} 页 · ` : ''}
              {pendingFile.text.length.toLocaleString()} 字符
            </span>
            {fileStatus && <span className="file-preview-status">{fileStatus}</span>}
          </div>
          <button className="file-preview-remove" onClick={() => { setPendingFile(null); setFileStatus('') }}>
            移除
          </button>
        </div>
      )}

      {isParsingFile && (
        <div className="file-preview-bar parsing">
          <div className="file-preview-spinner" aria-hidden="true" />
          <div className="file-preview-main">
            <span className="file-preview-name">正在解析文档</span>
            <span className="file-preview-status">
              {getParseStatusHint()}
            </span>
          </div>
        </div>
      )}

      {fileQueue.length > 1 && (
        <div className="file-queue-panel">
          <div className="file-queue-header">
            <span>文档队列 {fileQueue.filter((item) => item.status === 'done' || item.status === 'error').length}/{fileQueue.length}</span>
            <button className="file-preview-remove" onClick={() => setFileQueue([])}>
              收起
            </button>
          </div>
          <div className="file-queue-list">
            {fileQueue.map((item) => (
              <div key={item.id} className={`file-queue-item ${item.status}`}>
                <span className="file-queue-name">{item.name}</span>
                <span className="file-queue-status">
                  {item.status === 'waiting' ? '等待解析' : ''}
                  {item.status === 'parsing' ? '解析中...' : ''}
                  {item.status === 'done' ? (item.result?.provider === 'docling' ? '高级解析完成' : item.message || '完成') : ''}
                  {item.status === 'error' ? item.message || '解析失败' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`chat-input-shell ${variant === 'welcome' ? 'welcome' : ''}`}>
        <div className="chat-input-bar">
          <button
            className="chat-upload-btn"
            onClick={handleUpload}
            disabled={isStreaming || isPreparing || isParsingFile}
            title="上传文档"
            aria-label="上传文档"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.4 10.6 12 20a5.4 5.4 0 0 1-7.6-7.6l9.5-9.5a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.1-8.1" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            className="chat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isParsingFile ? '正在解析文档，请稍候...' : '输入您的科研问题...'}
            disabled={isParsingFile}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={isStreaming || isPreparing || isParsingFile || (!inputText.trim() && !pendingFile)}
          >
            {isParsingFile ? '解析中...' : isStreaming || isPreparing ? '生成中...' : '发送'}
          </button>
        </div>

        <div className="chat-input-options">
          <label className="composer-select-label">
            模型
            <select
              className="composer-select"
              value={draftModel}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="composer-select-label">
            推理强度
            <select
              className="composer-select"
              value={draftReasoningEffort}
              onChange={(e) => handleReasoningChange(e.target.value)}
            >
              <option value="">默认</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">XHigh</option>
            </select>
          </label>
          <label className={`composer-parse-toggle ${enableAdvancedParse ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={enableAdvancedParse}
              onChange={(e) => setEnableAdvancedParse(e.target.checked)}
            />
            高级PDF解析
          </label>
          <span className="composer-parse-hint">
            {enableAdvancedParse ? '高级解析尝试已开启，上传慢时会自动回退。' : '默认快速解析，适合日常上传。'}
          </span>
        </div>
      </div>
    </>
  )

  if (!currentChatId) {
    return (
      <div className="chat-area">
        <div className="welcome-composer">
          <div className="welcome-kicker">{APP_TITLE}</div>
          <div className="welcome-title">从哪个问题开始？</div>
          {renderToolToggles()}
          {renderComposer('welcome')}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-area">
      {renderToolToggles()}

      <div className="chat-messages" ref={messagesRef}>
        {currentMessages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            {msg.role === 'assistant' ? (
              <MarkdownViewer content={msg.content || (isStreaming ? '思考中...' : '')} />
            ) : (
              msg.content
            )}
          </div>
        ))}
      </div>

      <button
        className={`scroll-to-bottom ${isStreaming && showScrollBtn ? 'visible' : ''}`}
        onClick={scrollToBottom}
        title="回到最新"
      >
        ⬇
      </button>

      {renderComposer('dock')}
    </div>
  )
}
