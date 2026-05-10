import { useState, useEffect } from 'react'
import './App.css'
import { SettingsPanel } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { useSettingStore } from './store/settingStore'
import type { AppSettings } from './types/env'

const themeOrder: NonNullable<AppSettings['theme']>[] = ['system', 'light', 'dark']
const themeLabels: Record<NonNullable<AppSettings['theme']>, string> = {
  system: '跟随系统',
  light: '浅色模式',
  dark: '深色模式',
}

function getNextTheme(theme: NonNullable<AppSettings['theme']>) {
  const currentIndex = themeOrder.indexOf(theme)
  return themeOrder[(currentIndex + 1) % themeOrder.length]
}

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const { theme = 'system', setField, loadSettings, saveSettings } = useSettingStore()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // 监听并应用主题设置
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      // System
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  const handleToggleTheme = async () => {
    const nextTheme = getNextTheme(theme)
    setField('theme', nextTheme)
    const saved = await saveSettings({ theme: nextTheme })
    if (!saved) {
      alert('保存主题失败，请稍后重试。')
    }
  }

  return (
    <div className="app-layout">
      <Sidebar
        themeLabel={themeLabels[theme]}
        showSettings={showSettings}
        onToggleTheme={handleToggleTheme}
        onToggleSettings={() => setShowSettings(!showSettings)}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <ChatArea />

        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}
      </div>
    </div>
  )
}

export default App
