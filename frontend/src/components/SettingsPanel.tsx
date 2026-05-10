import { useEffect, useState } from 'react'
import { useSettingStore } from '../store/settingStore'

interface SettingsPanelProps {
  onClose?: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { 
    apiKey, baseUrl, tavilyKey, isLoaded,
    setField, loadSettings, saveSettings 
  } = useSettingStore()
  const [connectionStatus, setConnectionStatus] = useState<{
    kind: 'idle' | 'checking' | 'success' | 'error'
    message: string
  }>({ kind: 'idle', message: '' })

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  if (!isLoaded) return <div className="settings-overlay">Loading settings...</div>

  const handleSave = async () => {
    const saved = await saveSettings()
    if (saved) {
      onClose?.()
      return
    }
    alert('保存设置失败，请稍后重试。')
  }

  const handleTestConnection = async () => {
    setConnectionStatus({ kind: 'checking', message: '正在测试连接...' })
    await saveSettings()

    if (!window.electronAPI) {
      setConnectionStatus({ kind: 'error', message: '当前浏览器预览环境无法测试 Electron 主进程连接。' })
      return
    }

    try {
      const result = await window.electronAPI.testConnection()
      setConnectionStatus({
        kind: result.ok ? 'success' : 'error',
        message: result.message
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接测试失败'
      setConnectionStatus({ kind: 'error', message })
    }
  }

  return (
    <div className="settings-overlay">
      <h2 className="settings-title">全局设置</h2>
      
      <div className="settings-group">
        <label className="settings-label">API Key:</label>
        <input 
          className="settings-input"
          type="password" 
          value={apiKey} 
          onChange={(e) => setField('apiKey', e.target.value)} 
        />
      </div>

      <div className="settings-group">
        <label className="settings-label">Base URL:</label>
        <input 
          className="settings-input"
          type="text" 
          value={baseUrl} 
          onChange={(e) => setField('baseUrl', e.target.value)} 
        />
      </div>

      <div className="settings-group">
        <label className="settings-label">Tavily 搜索 Key:</label>
        <input
          className="settings-input"
          type="password"
          value={tavilyKey}
          placeholder="留空则仅使用 PubMed"
          onChange={(e) => setField('tavilyKey', e.target.value)}
        />
      </div>

      {connectionStatus.kind !== 'idle' && (
        <div className={`settings-status ${connectionStatus.kind}`}>
          {connectionStatus.message}
        </div>
      )}

      <div className="settings-actions">
        <button
          className="settings-test-btn"
          onClick={handleTestConnection}
          disabled={connectionStatus.kind === 'checking'}
        >
          {connectionStatus.kind === 'checking' ? '测试中...' : '测试连接'}
        </button>
        <button className="settings-save-btn" onClick={handleSave}>
          保存设置
        </button>
      </div>
    </div>
  )
}
