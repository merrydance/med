import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useSettingStore } from '../store/settingStore'
import { MarkdownViewer } from './MarkdownViewer'
import type { ChatMessage } from '../types/chat'
import type { FileReadResult } from '../types/env'

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
  const [isPreparing, setIsPreparing] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  const isUserScrollingRef = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const appendToAssistantBubble = useCallback((content: string) => {
    const { currentMessages: latestMessages } = useChatStore.getState()
    const lastMsg = latestMessages[latestMessages.length - 1]
    if (lastMsg?.role === 'assistant') {
      appendAssistantStream(content)
      return
    }

    addMessage({
      id: Math.random().toString(36).substring(2, 15),
      role: 'system',
      content,
      createdAt: Date.now()
    })
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
        appendAssistantStream(chunk)
      })
      window.electronAPI.onChatComplete(async () => {
        await finalizeStream()
        setStreaming(false)
      })
      window.electronAPI.onChatError((errMsg) => {
        setStreaming(false)
        setIsPreparing(false)
        appendToAssistantBubble(`\n\n错误: ${errMsg}`)
      })
    }
  }, [appendAssistantStream, finalizeStream, setStreaming, appendToAssistantBubble])

  // ====== 发送 ======

  const buildSystemPrompt = () => {
    if (!enableNeuro) return '你是一位专业的 AI 科研助手。请用严谨、清晰、可追溯的方式回答。'

    return `你是一位资深神经外科科研顾问，熟悉脑肿瘤、脑血管病、功能神经外科、神经重症、医学统计与论文写作。
回答要求：
- 优先给出可执行的科研和临床思路，但不要替代医生临床判断。
- 涉及诊疗建议时说明证据等级、适用前提和不确定性。
- 涉及文献时尽量指出来源类型、研究设计、样本量和局限性。
- 默认使用中文，结构清晰，必要时使用表格。`
  }

  const buildUserContent = (text: string) => {
    if (!enableDoc || !pendingFile) return text

    const truncated = pendingFile.text.slice(0, 30000)
    return `[上传文档: ${pendingFile.name}]\n\n---\n文档内容:\n${truncated}\n---\n\n${text || '请分析这篇文档。'}`
  }

  const getSearchContext = async (query: string) => {
    if (!enableSearch || !query.trim() || !window.electronAPI) return ''

    const sourceLabel = tavilyKey ? 'PubMed + 网络' : 'PubMed'
    appendAssistantStream(`正在搜索 ${sourceLabel}...\n\n`)

    const context = await window.electronAPI.searchTavily(query)
    if (!context) {
      appendAssistantStream('未检索到可用结果，继续基于已有上下文回答。\n\n')
      return ''
    }

    appendAssistantStream('搜索完成，正在结合检索结果分析...\n\n')
    return `\n\n=== 实时检索结果 ===\n请优先结合以下最新检索结果回答，并在回答中说明信息来源：\n${context}`
  }

  const handleUpload = async () => {
    if (!window.electronAPI || isStreaming) return

    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) return

      const file = await window.electronAPI.readFile(filePath)
      setPendingFile(file)
      setEnableDoc(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件读取失败'
      addMessage({
        id: Math.random().toString(36).substring(2, 15),
        role: 'system',
        content: `错误: ${message}`,
        createdAt: Date.now()
      })
    }
  }

  const handleSend = async () => {
    const trimmedInput = inputText.trim()
    if ((!trimmedInput && !pendingFile) || isStreaming || isPreparing) return

    if (!currentChatId) {
      await createNewChat({
        model: draftModel,
        reasoningEffort: draftReasoningEffort
      })
    }

    const userContent = buildUserContent(trimmedInput)

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 15),
      role: 'user',
      content: userContent,
      createdAt: Date.now()
    }

    addMessage(userMsg)
    setInputText('')
    setPendingFile(null)
    isUserScrollingRef.current = false

    const aiMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 15),
      role: 'assistant',
      content: '',
      createdAt: Date.now()
    }
    addMessage(aiMsg)
    setStreaming(true)
    setIsPreparing(true)

    if (window.electronAPI) {
      let searchContext = ''
      try {
        searchContext = await getSearchContext(trimmedInput || pendingFile?.name || '')
      } catch (error) {
        const message = error instanceof Error ? error.message : '搜索失败'
        appendAssistantStream(`搜索失败：${message}\n\n`)
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
      ].map(m => ({
        role: m.role === 'system' ? 'assistant' : m.role,
        content: m.content
      }))
      await window.electronAPI.chat({ messages: messagesPayload, settings: settingsForChat })
    } else {
      setIsPreparing(false)
      setTimeout(() => {
        appendAssistantStream('（网页版模拟）**Markdown 渲染**已就绪！\n\n| 功能 | 状态 |\n|---|---|\n| 代码高亮 | ✅ |\n| XSS 过滤 | ✅ |\n| 表格横向滚动 | ✅ |\n\n```python\nprint("Hello, Neurosurgery!")\n```')
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

  const renderComposer = (variant: 'welcome' | 'dock') => (
    <>
      {pendingFile && (
        <div className="file-preview-bar">
          <span className="file-preview-name">{pendingFile.name}</span>
          <span className="file-preview-meta">
            {pendingFile.pages > 1 ? `${pendingFile.pages} 页 · ` : ''}
            {pendingFile.text.length.toLocaleString()} 字符
          </span>
          <button className="file-preview-remove" onClick={() => setPendingFile(null)}>
            移除
          </button>
        </div>
      )}

      <div className={`chat-input-shell ${variant === 'welcome' ? 'welcome' : ''}`}>
        <div className="chat-input-bar">
          <button
            className="chat-upload-btn"
            onClick={handleUpload}
            disabled={isStreaming || isPreparing}
            title="上传文档"
            aria-label="上传文档"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.4 10.6 12 20a5.4 5.4 0 0 1-7.6-7.6l9.5-9.5a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.1-8.1" />
            </svg>
          </button>
          <input
            type="text"
            className="chat-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入您的科研问题..."
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={isStreaming || isPreparing || (!inputText.trim() && !pendingFile)}
          >
            {isStreaming || isPreparing ? '生成中...' : '发送'}
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
        </div>
      </div>
    </>
  )

  if (!currentChatId) {
    return (
      <div className="chat-area">
        <div className="welcome-composer">
          <div className="welcome-kicker">神经外科 AI 科研助手</div>
          <div className="welcome-title">从哪个问题开始？</div>
          {renderComposer('welcome')}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-area">
      <div className="chat-toolbar">
        <label className={`tool-toggle ${enableDoc ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={enableDoc}
            onChange={(e) => setEnableDoc(e.target.checked)}
          />
          文档分析
        </label>
        <label className={`tool-toggle ${enableSearch ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={enableSearch}
            onChange={(e) => setEnableSearch(e.target.checked)}
          />
          联网搜索
        </label>
        <label className={`tool-toggle ${enableNeuro ? 'active' : ''}`}>
          <input
            type="checkbox"
            checked={enableNeuro}
            onChange={(e) => setEnableNeuro(e.target.checked)}
          />
          神经外科模式
        </label>
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {currentMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '4rem' }}>
            开始对话...
          </div>
        )}
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
