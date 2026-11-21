import { useEffect, useState } from 'react'
import type { SyncStatus } from '@shared/sync/protocol'

export function DeviceSyncPanel() {
  const [status, setStatus] = useState<SyncStatus>({ running: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void window.api.sync
      .status()
      .then(setStatus)
      .catch((e) => setError(String(e)))
  }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      setStatus(await (status.running ? window.api.sync.stop() : window.api.sync.start()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" style={{ padding: 20, marginBottom: 20 }} aria-label="设备同步">
      <h2>设备同步</h2>
      <p>同一局域网内可双向同步阅读与工作台问题、Markdown 记录、独立待办、附件和成就。Android 手机可打开篇目，点击「下载朗读」接收电脑已有的音频。</p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void toggle()}>
        {busy ? '处理中…' : status.running ? '关闭局域网同步' : '开启局域网同步'}
      </button>
      {status.running && (
        <p role="status">
          等待手机发现「{status.device?.name}」。在 Android 端打开应用并接受同步邀请，核对两端显示的
          6 位数字后确认。
        </p>
      )}
      {(error || status.error || status.discoveryError) && (
        <p role="alert" className="error-text">
          {error || status.error || `自动发现无法启动：${status.discoveryError}`}
        </p>
      )}
    </section>
  )
}
