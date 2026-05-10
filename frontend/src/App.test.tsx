// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useChatStore } from './store/chatStore'
import { useSettingStore } from './store/settingStore'
import type { AppSettings, ElectronAPI } from './types/env'

const defaultSettings: AppSettings = {
  baseUrl: '',
  apiKey: '',
  tavilyKey: '',
  model: 'gpt-5.5',
  customModel: '',
  reasoningEffort: '',
  theme: 'system',
}

function mockElectronApi(overrides: Partial<ElectronAPI> = {}) {
  const api = {
    getSettings: vi.fn().mockResolvedValue(defaultSettings),
    saveSettings: vi.fn().mockResolvedValue(true),
    testConnection: vi.fn(),
    openFileDialog: vi.fn(),
    openFileDialogs: vi.fn(),
    readFile: vi.fn(),
    selectDocumentContext: vi.fn(),
    dbGetChats: vi.fn().mockResolvedValue([]),
    dbGetMessages: vi.fn().mockResolvedValue([]),
    dbCreateChat: vi.fn(),
    dbInsertMessage: vi.fn(),
    dbUpdateChatTitle: vi.fn(),
    dbUpdateChatModelConfig: vi.fn(),
    dbTouchChat: vi.fn(),
    dbDeleteChat: vi.fn(),
    chat: vi.fn(),
    onChatDelta: vi.fn(),
    onChatComplete: vi.fn(),
    onChatError: vi.fn(),
    searchTavily: vi.fn(),
    ...overrides,
  } satisfies ElectronAPI

  window.electronAPI = api
  return api
}

describe('App settings controls', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
    useSettingStore.setState({
      ...defaultSettings,
      isLoaded: false,
    })
    useChatStore.setState({
      chats: [],
      currentChatId: null,
      currentMessages: [],
      draftModel: 'gpt-5.5',
      draftReasoningEffort: '',
      isLoaded: false,
      isStreaming: false,
    })
    mockElectronApi()
  })

  it('closes settings after a successful save without an alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(screen.queryByText('全局设置')).toBeNull()
    })
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('keeps settings open and alerts when saving fails', async () => {
    const api = mockElectronApi({
      saveSettings: vi.fn().mockResolvedValue(false),
    })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('保存设置失败，请稍后重试。')
    })
    expect(screen.getByText('全局设置')).toBeTruthy()
    expect(api.saveSettings).toHaveBeenCalled()
  })

  it('opens an about page below settings with beta guidance, risks, references and credits', async () => {
    render(<App />)

    const settingsButton = await screen.findByRole('button', { name: '设置' })
    const aboutButton = screen.getByRole('button', { name: '关于' })
    expect(settingsButton.compareDocumentPosition(aboutButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(aboutButton)

    expect(screen.getByText('关于神外医生AI助手')).toBeTruthy()
    expect(screen.getByText('测试版说明')).toBeTruthy()
    expect(screen.getByText('v0.1.0 Beta')).toBeTruthy()
    expect(screen.getByText(/当前是测试版/)).toBeTruthy()
    expect(screen.getByText(/用于神经外科科研与临床辅助场景/)).toBeTruthy()
    expect(screen.getByText(/上传 PDF/)).toBeTruthy()
    expect(screen.queryByText(/本地片段检索/)).toBeNull()
    expect(screen.getByText(/长文档会自动选取最相关的内容/)).toBeTruthy()
    expect(screen.queryByText(/引用文献时应尽量/)).toBeNull()
    expect(screen.getByText(/系统会尽量在回答中提供 PMID、PubMed 链接和 DOI/)).toBeTruthy()
    expect(screen.getByText(/可能存在幻觉/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /WHO LMM 医疗 AI 治理指导/ }).getAttribute('href')).toBe('https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models')
    expect(screen.getByRole('link', { name: /PubMed Help/ }).getAttribute('href')).toBe('https://pubmed.ncbi.nlm.nih.gov/help/')
    expect(screen.getByRole('link', { name: /NCBI E-utilities/ }).getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/books/NBK25499/')
    expect(screen.getByRole('link', { name: 'MeSH 医学主题词体系' }).getAttribute('href')).toBe('https://www.ncbi.nlm.nih.gov/mesh')
    expect(screen.getByText(/React/)).toBeTruthy()
    expect(screen.getByText(/Electron/)).toBeTruthy()
    expect(screen.getByText(/better-sqlite3/)).toBeTruthy()
  })

  it('shows the current theme in the sidebar footer and saves the next value when clicked', async () => {
    const api = mockElectronApi()
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '跟随系统' }))

    await waitFor(() => {
      expect(api.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'light' }))
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(screen.getByRole('button', { name: '浅色模式' })).toBeTruthy()
  })

  it('renders custom window controls and forwards clicks to Electron', async () => {
    const api = mockElectronApi()
    const minimizeWindow = vi.fn().mockResolvedValue(undefined)
    const toggleMaximizeWindow = vi.fn().mockResolvedValue(undefined)
    const closeWindow = vi.fn().mockResolvedValue(undefined)
    Object.assign(api, { minimizeWindow, toggleMaximizeWindow, closeWindow })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '最小化窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '最大化或还原窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭窗口' }))

    expect(minimizeWindow).toHaveBeenCalledTimes(1)
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1)
    expect(closeWindow).toHaveBeenCalledTimes(1)
  })

  it('uses the new product name in the main chrome', async () => {
    render(<App />)

    expect(await screen.findAllByText('神外医生AI助手')).toHaveLength(2)
  })

  it('does not show a redundant empty-chat placeholder', async () => {
    useChatStore.setState({
      currentChatId: 'chat-1',
      currentMessages: [],
    })

    render(<App />)

    await screen.findByText('文档分析')
    expect(screen.queryByText('开始对话...')).toBeNull()
  })

  it('starts a new chat from the welcome composer using selected model options', async () => {
    const api = mockElectronApi()
    render(<App />)

    expect(screen.queryByText('请在左侧选择或新建一个会话')).toBeNull()

    fireEvent.change(await screen.findByLabelText('模型'), { target: { value: 'gpt-4o' } })
    fireEvent.change(screen.getByLabelText('推理强度'), { target: { value: 'high' } })
    fireEvent.change(screen.getByPlaceholderText('输入您的科研问题...'), { target: { value: '胶质母细胞瘤复发治疗进展' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(api.dbCreateChat).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-4o',
        reasoningEffort: 'high',
      }))
      expect(api.chat).toHaveBeenCalled()
    })
  })

  it('keeps the medical guardrail prompt as a system message', async () => {
    const chat = vi.fn()
    mockElectronApi({ chat })
    render(<App />)

    fireEvent.change(await screen.findByPlaceholderText('输入您的科研问题...'), { target: { value: '垂体腺瘤术后尿崩症处理' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(chat).toHaveBeenCalled()
    })
    const [{ messages }] = chat.mock.calls[0]
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('不得编造 PMID')
    expect(messages[0].content).toContain('未检索到足够证据')
    expect(messages[0].content).toContain('医学证据类回答结构')
    expect(messages[0].content).toContain('写作、润色、翻译、头脑风暴或研究设计构思')
    expect(messages[0].content).toContain('证据依据')
    expect(messages[0].content).toContain('可追踪引用')
    expect(messages[0].content).toContain('不得把模型背景知识包装成检索证据')
  })

  it('shows Chinese PubMed query guidance when searching from a Chinese question', async () => {
    const api = mockElectronApi({
      searchTavily: vi.fn().mockResolvedValue('\n\n【PubMed 检索说明】\n检测到中文输入，已使用内置检索提示词生成 PubMed 检索式。'),
    })
    useChatStore.setState({
      currentChatId: 'chat-1',
      currentMessages: [],
    })
    render(<App />)

    fireEvent.click(await screen.findByText('联网搜索'))
    fireEvent.change(screen.getByPlaceholderText('输入您的科研问题...'), { target: { value: '胶质母细胞瘤复发治疗进展' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getByText(/PubMed 对英文检索词和 MeSH\/ATM 更友好/)).toBeTruthy()
    })
    expect(api.searchTavily).toHaveBeenCalledWith('胶质母细胞瘤复发治疗进展')
  })

  it('shows clear document parsing status while uploading a file', async () => {
    let resolveFile: (value: Awaited<ReturnType<ElectronAPI['readFile']>>) => void
    const api = mockElectronApi({
      openFileDialog: vi.fn().mockResolvedValue('/tmp/paper.pdf'),
      readFile: vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveFile = resolve
      })),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '上传文档' }))

    expect(await screen.findByText('正在解析文档')).toBeTruthy()
    expect(screen.getByText(/正在使用快速兼容解析读取/)).toBeTruthy()

    resolveFile!({
      name: 'paper.pdf',
      text: '胶质母细胞瘤研究',
      pages: 12,
      provider: 'pdf-parse',
      warnings: [],
    })

    await waitFor(() => {
      expect(screen.getByText('兼容解析完成')).toBeTruthy()
    })
    expect(screen.getByText('paper.pdf')).toBeTruthy()
    expect(api.readFile).toHaveBeenCalledWith('/tmp/paper.pdf', { mode: 'fast' })
  })

  it('queues multiple selected documents and shows per-file parse status', async () => {
    const api = mockElectronApi({
      openFileDialogs: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']),
      readFile: vi.fn()
        .mockResolvedValueOnce({
          name: 'a.pdf',
          text: '第一篇论文',
          pages: 8,
          provider: 'docling',
          warnings: [],
        })
        .mockResolvedValueOnce({
          name: 'b.pdf',
          text: '第二篇论文',
          pages: 4,
          provider: 'pdf-parse',
          fallbackFrom: 'docling',
          warnings: ['未检测到 Docling，已自动使用兼容解析。'],
        }),
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '上传文档' }))

    await waitFor(() => {
      expect(screen.getAllByText('文档队列 2/2').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('a.pdf')).toBeTruthy()
    expect(screen.getAllByText('b.pdf').length).toBeGreaterThan(0)
    expect(screen.getByText('高级解析完成')).toBeTruthy()
    expect(screen.getByText('未检测到 Docling，已自动使用兼容解析。')).toBeTruthy()
    expect(api.readFile).toHaveBeenCalledTimes(2)
    expect(api.readFile).toHaveBeenNthCalledWith(1, '/tmp/a.pdf', { mode: 'fast' })
  })

  it('can opt into advanced PDF parsing for the next upload', async () => {
    const api = mockElectronApi({
      openFileDialogs: vi.fn().mockResolvedValue(['/tmp/advanced.pdf']),
      readFile: vi.fn().mockResolvedValue({
        name: 'advanced.pdf',
        text: '高级解析文本',
        pages: 1,
        provider: 'docling',
        warnings: [],
      }),
    })
    render(<App />)

    fireEvent.click(await screen.findByLabelText('高级PDF解析'))
    fireEvent.click(screen.getByRole('button', { name: '上传文档' }))

    await waitFor(() => {
      expect(api.readFile).toHaveBeenCalledWith('/tmp/advanced.pdf', { mode: 'advanced' })
    })
    expect(screen.getByText(/高级解析尝试已开启/)).toBeTruthy()
  })
})
