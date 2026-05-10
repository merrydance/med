import { APP_TITLE } from '../constants/app'

export function WindowTitleBar() {
  const minimizeWindow = () => window.electronAPI?.minimizeWindow?.()
  const toggleMaximizeWindow = () => window.electronAPI?.toggleMaximizeWindow?.()
  const closeWindow = () => window.electronAPI?.closeWindow?.()

  return (
    <div className="window-titlebar">
      <div className="window-titlebar-title">{APP_TITLE}</div>
      <div className="window-titlebar-controls">
        <button
          type="button"
          className="window-control"
          aria-label="最小化窗口"
          title="最小化"
          onClick={minimizeWindow}
        >
          <span aria-hidden="true">-</span>
        </button>
        <button
          type="button"
          className="window-control"
          aria-label="最大化或还原窗口"
          title="最大化/还原"
          onClick={toggleMaximizeWindow}
        >
          <span aria-hidden="true">□</span>
        </button>
        <button
          type="button"
          className="window-control close"
          aria-label="关闭窗口"
          title="关闭"
          onClick={closeWindow}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  )
}
