import { useEffect } from 'react'
import { useChatStore } from '../store/chatStore'

interface SidebarProps {
  themeLabel: string
  showSettings: boolean
  showAbout: boolean
  onToggleTheme: () => void
  onToggleSettings: () => void
  onToggleAbout: () => void
}

export function Sidebar({ themeLabel, showSettings, showAbout, onToggleTheme, onToggleSettings, onToggleAbout }: SidebarProps) {
  const { chats, currentChatId, isLoaded, loadChats, switchChat, createNewChat, deleteChat } = useChatStore()

  useEffect(() => {
    loadChats()
  }, [loadChats])

  if (!isLoaded) {
    return <div className="sidebar" style={{ justifyContent: 'center', alignItems: 'center' }}>加载中...</div>
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="sidebar-new-btn" onClick={() => createNewChat()}>
          + 新建对话
        </button>
      </div>

      <div className="sidebar-list">
        {chats.map(chat => (
          <div
            key={chat.id}
            className={`sidebar-item ${currentChatId === chat.id ? 'active' : ''}`}
            onClick={() => switchChat(chat.id)}
          >
            <span className="sidebar-item-title">{chat.title}</span>
            <button
              className="sidebar-item-delete"
              onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
            >
              ✕
            </button>
          </div>
        ))}
        {chats.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '2rem', fontSize: '0.85rem' }}>
            暂无会话
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-footer-btn" onClick={onToggleTheme}>
          {themeLabel}
        </button>
        <button className="sidebar-footer-btn primary" onClick={onToggleSettings}>
          {showSettings ? '关闭设置' : '设置'}
        </button>
        <button className="sidebar-footer-btn" onClick={onToggleAbout}>
          {showAbout ? '关闭关于' : '关于'}
        </button>
      </div>
    </div>
  )
}
