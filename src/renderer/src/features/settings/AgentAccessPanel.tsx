import { useEffect, useState } from 'react'
import type { AgentAccessStatus, MaoxuanApi } from '@shared/api'

export function AgentAccessPanel({ access }: { access: NonNullable<MaoxuanApi['agent']> }) {
  const [status, setStatus] = useState<AgentAccessStatus>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void access
      .status()
      .then(setStatus)
      .catch((error: Error) => setError(error.message))
  }, [access])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      setStatus(await (status?.running ? access.stop() : access.start()))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card" style={{ padding: 20, marginBottom: 20 }} aria-label="Agent 访问">
      <h2>Agent 访问</h2>
      <p>允许本机 Agent 查询活跃工作台并安排任务。任务会出现在「工作清单」。</p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void toggle()}>
        {busy ? '处理中…' : status?.running ? '关闭 Agent 访问' : '开启 Agent 访问'}
      </button>
      {status?.running && (
        <p role="status">已开启。可在本机通过 $maoxuan-workbench 安排任务，退出应用后连接失效。</p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
