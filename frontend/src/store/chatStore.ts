import { create } from 'zustand'
import type { ChatSession, ChatMessage } from '../types/chat'

export const DEFAULT_CHAT_MODEL = 'gpt-5.5'
export const DEFAULT_REASONING_EFFORT = 'high'

interface ChatState {
  chats: ChatSession[]
  currentChatId: string | null
  currentMessages: ChatMessage[]
  draftModel: string
  draftReasoningEffort: string
  isLoaded: boolean
  isStreaming: boolean

  loadChats: () => Promise<void>
  switchChat: (chatId: string) => Promise<void>
  startNewDraft: () => void
  createNewChat: (config?: Partial<Pick<ChatSession, 'model' | 'reasoningEffort'>>) => Promise<ChatSession>
  addMessage: (message: ChatMessage, chatId?: string) => void
  appendAssistantStream: (chunk: string, chatId?: string) => void
  finalizeStream: (chatId?: string) => Promise<void>
  setStreaming: (streaming: boolean) => void
  updateChatTitle: (chatId: string, title: string) => void
  updateChatModelConfig: (chatId: string | null, config: Pick<ChatSession, 'model' | 'reasoningEffort'>) => void
  deleteChat: (chatId: string) => void
}

const generateId = () => Math.random().toString(36).substring(2, 15)

// 判断是否在 Electron 环境且数据库接口可用
const hasDb = () => !!(window.electronAPI?.dbGetChats)

function normalizeChat(chat: ChatSession): ChatSession {
  return {
    ...chat,
    model: chat.model || DEFAULT_CHAT_MODEL,
    reasoningEffort: chat.reasoningEffort || DEFAULT_REASONING_EFFORT,
    messages: chat.messages || []
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  currentChatId: null,
  currentMessages: [],
  draftModel: DEFAULT_CHAT_MODEL,
  draftReasoningEffort: DEFAULT_REASONING_EFFORT,
  isLoaded: false,
  isStreaming: false,

  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  // ====== 流式追加（高频，不写盘） ======
  appendAssistantStream: (chunk: string, chatId?: string) => {
    const { currentChatId, currentMessages, chats } = get()
    const targetChatId = chatId || currentChatId
    if (!targetChatId) return

    const isCurrentChat = currentChatId === targetChatId
    const targetMessages = isCurrentChat
      ? currentMessages
      : chats.find((chat) => chat.id === targetChatId)?.messages || []
    if (targetMessages.length === 0) return

    const lastMsg = targetMessages[targetMessages.length - 1]
    if (lastMsg.role !== 'assistant') return

    const updatedMsg = { ...lastMsg, content: lastMsg.content + chunk }
    const newMessages = [...targetMessages.slice(0, -1), updatedMsg]
    const updatedChats = chats.map((chat) =>
      chat.id === targetChatId ? { ...chat, messages: newMessages, updatedAt: Date.now() } : chat
    )

    set({
      chats: updatedChats,
      ...(isCurrentChat ? { currentMessages: newMessages } : {})
    })
    // 仍不写盘，避免每个 chunk 都触发持久化；流结束后 finalizeStream 统一写入
  },

  // ====== 流结束后一次性落盘 ======
  finalizeStream: async (chatId?: string) => {
    const { currentChatId, currentMessages, chats } = get()
    const targetChatId = chatId || currentChatId
    if (!targetChatId) return

    const isCurrentChat = currentChatId === targetChatId
    const targetMessages = isCurrentChat
      ? currentMessages
      : chats.find((chat) => chat.id === targetChatId)?.messages || []
    if (targetMessages.length === 0) return

    const lastMsg = targetMessages[targetMessages.length - 1]
    if (lastMsg.role !== 'assistant') return

    // 同步内存中的 chats 列表
    const updatedChats = chats.map((c) =>
      c.id === targetChatId ? { ...c, messages: targetMessages, updatedAt: Date.now() } : c
    )
    set({
      chats: updatedChats,
      ...(isCurrentChat ? { currentMessages: targetMessages } : {})
    })

    // 持久化
    if (hasDb()) {
      await window.electronAPI.dbInsertMessage({
        id: lastMsg.id,
        chatId: targetChatId,
        role: lastMsg.role,
        content: lastMsg.content,
        createdAt: lastMsg.createdAt
      })
      await window.electronAPI.dbTouchChat(targetChatId)
    } else {
      localStorage.setItem('app-chats', JSON.stringify(updatedChats))
    }
  },

  // ====== 加载会话列表 ======
  loadChats: async () => {
    try {
      if (hasDb()) {
        const chats = await window.electronAPI.dbGetChats()
        set({ chats: (chats as ChatSession[]).map(normalizeChat), isLoaded: true })
      } else {
        const stored = localStorage.getItem('app-chats')
        const parsed = stored ? JSON.parse(stored) : []
        const chats = Array.isArray(parsed) ? parsed.map(normalizeChat) : []
        set({ chats, isLoaded: true })
      }
    } catch (e) {
      console.error('Failed to load chats', e)
      set({ isLoaded: true })
    }
  },

  // ====== 切换会话（按需加载消息） ======
  switchChat: async (chatId: string) => {
    try {
      if (hasDb()) {
        const messages = await window.electronAPI.dbGetMessages(chatId)
        const chats = get().chats
        const chat = chats.find((c) => c.id === chatId)
        const cachedMessages = chat?.messages || []
        const selectedMessages = cachedMessages.length >= messages.length
          ? cachedMessages
          : messages as ChatMessage[]
        const updatedChats = chats.map((c) =>
          c.id === chatId ? { ...c, messages: selectedMessages } : c
        )
        set({
          chats: updatedChats,
          currentChatId: chatId,
          currentMessages: selectedMessages,
          draftModel: chat?.model || DEFAULT_CHAT_MODEL,
          draftReasoningEffort: chat?.reasoningEffort || DEFAULT_REASONING_EFFORT
        })
      } else {
        const chat = get().chats.find((c) => c.id === chatId)
        if (chat) {
          set({
            currentChatId: chatId,
            currentMessages: chat.messages || [],
            draftModel: chat.model,
            draftReasoningEffort: chat.reasoningEffort
          })
        }
      }
    } catch (e) {
      console.error('Failed to switch chat', e)
    }
  },

  startNewDraft: () => {
    set({
      currentChatId: null,
      currentMessages: []
    })
  },

  // ====== 新建会话 ======
  createNewChat: async (config = {}) => {
    const { draftModel, draftReasoningEffort } = get()
    const newChat: ChatSession = {
      id: generateId(),
      title: '新对话',
      model: config.model || draftModel || DEFAULT_CHAT_MODEL,
      reasoningEffort: config.reasoningEffort ?? draftReasoningEffort ?? DEFAULT_REASONING_EFFORT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    }

    if (hasDb()) {
      await window.electronAPI.dbCreateChat({
        id: newChat.id,
        title: newChat.title,
        model: newChat.model,
        reasoningEffort: newChat.reasoningEffort,
        createdAt: newChat.createdAt,
        updatedAt: newChat.updatedAt
      })
    }

    const newChats = [newChat, ...get().chats]
    set({
      chats: newChats,
      currentChatId: newChat.id,
      currentMessages: [],
      draftModel: newChat.model,
      draftReasoningEffort: newChat.reasoningEffort
    })

    if (!hasDb()) {
      localStorage.setItem('app-chats', JSON.stringify(newChats))
    }

    return newChat
  },

  // ====== 添加单条消息（用户消息 / 空 assistant 占位） ======
  addMessage: (message: ChatMessage, chatId?: string) => {
    const { currentChatId, chats, currentMessages } = get()
    const targetChatId = chatId || currentChatId
    if (!targetChatId) return

    const isCurrentChat = currentChatId === targetChatId
    const targetMessages = isCurrentChat
      ? currentMessages
      : chats.find((chat) => chat.id === targetChatId)?.messages || []
    const newMessages = [...targetMessages, message]
    const updatedChats = chats.map((c) => {
      if (c.id === targetChatId) {
        let newTitle = c.title
        if (newMessages.length === 1 && message.role === 'user') {
          newTitle = message.content.length > 15
            ? message.content.substring(0, 15) + '...'
            : message.content
        }
        return { ...c, messages: newMessages, updatedAt: Date.now(), title: newTitle }
      }
      return c
    })

    // 置顶当前会话
    const idx = updatedChats.findIndex((c) => c.id === targetChatId)
    if (idx > 0) {
      const chat = updatedChats.splice(idx, 1)[0]
      updatedChats.unshift(chat)
    }

    set({
      chats: updatedChats,
      ...(isCurrentChat ? { currentMessages: newMessages } : {})
    })

    // 用户消息立即落盘；assistant 占位（content=''）不落盘，等流结束后 finalizeStream 统一写入
    if (message.role === 'user' && message.content) {
      if (hasDb()) {
        window.electronAPI.dbInsertMessage({
          id: message.id,
          chatId: targetChatId,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt
        })
        // 如果标题被更新了，也同步写盘
        const updatedChat = updatedChats.find((c) => c.id === targetChatId)
        if (updatedChat && updatedChat.title !== '新对话') {
          window.electronAPI.dbUpdateChatTitle(targetChatId, updatedChat.title)
        }
        window.electronAPI.dbTouchChat(targetChatId)
      } else {
        localStorage.setItem('app-chats', JSON.stringify(updatedChats))
      }
    }
  },

  updateChatTitle: (chatId, title) => {
    const updatedChats = get().chats.map((c) =>
      c.id === chatId ? { ...c, title } : c
    )
    set({ chats: updatedChats })
    if (hasDb()) {
      window.electronAPI.dbUpdateChatTitle(chatId, title)
    } else {
      localStorage.setItem('app-chats', JSON.stringify(updatedChats))
    }
  },

  updateChatModelConfig: (chatId, config) => {
    const normalizedConfig = {
      model: config.model || DEFAULT_CHAT_MODEL,
      reasoningEffort: config.reasoningEffort || DEFAULT_REASONING_EFFORT
    }

    set({
      draftModel: normalizedConfig.model,
      draftReasoningEffort: normalizedConfig.reasoningEffort
    })

    if (!chatId) return

    const updatedChats = get().chats.map((c) =>
      c.id === chatId ? { ...c, ...normalizedConfig } : c
    )
    set({ chats: updatedChats })

    if (hasDb()) {
      window.electronAPI.dbUpdateChatModelConfig(chatId, normalizedConfig)
    } else {
      localStorage.setItem('app-chats', JSON.stringify(updatedChats))
    }
  },

  deleteChat: (chatId) => {
    const newChats = get().chats.filter((c) => c.id !== chatId)
    const stateUpdate: Partial<ChatState> = { chats: newChats }
    if (get().currentChatId === chatId) {
      const nextChat = newChats[0]
      stateUpdate.currentChatId = nextChat?.id || null
      stateUpdate.currentMessages = nextChat?.messages || []
      stateUpdate.draftModel = nextChat?.model || get().draftModel
      stateUpdate.draftReasoningEffort = nextChat?.reasoningEffort || get().draftReasoningEffort
    }
    set(stateUpdate)
    if (hasDb()) {
      window.electronAPI.dbDeleteChat(chatId)
    } else {
      localStorage.setItem('app-chats', JSON.stringify(newChats))
    }
  }
}))
