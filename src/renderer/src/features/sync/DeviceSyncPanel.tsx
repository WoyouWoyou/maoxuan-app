import { useEffect, useState } from 'react'
import type { SyncStatus, SyncDocument } from '@shared/sync/protocol'
const text = (d: SyncDocument) =>
  d.kind === 'note'
    ? d.value.markdown
    : d.kind === 'folder'
      ? d.value.name
      : d.kind === 'action'
        ? d.value.text
        : JSON.stringify(d.value.session.data, null, 2)
export function DeviceSyncPanel({
  mobile = false,
  onSynced,
  disabled = false,
  onBusyChange
}: {
  mobile?: boolean
  onSynced?: () => void
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [status, setStatus] = useState<SyncStatus>({ running: false, pairing: [] }),
    [pairing, setPairing] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const [conflicts, setConflicts] = useState<
    { key: string; local: SyncDocument; remote: SyncDocument }[]
  >([])
  useEffect(() => {
    if (!mobile)
      void window.api.sync
        .status()
        .then(setStatus)
        .catch((e) => setError(String(e)))
  }, [mobile])
  async function run(job: () => Promise<void>) {
    if (busy || disabled) return
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    try {
      await job()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }
  return (
    <section className="card" style={{ padding: 20, marginBottom: 20 }} aria-label="设备同步">
      <h2>设备同步</h2>
      <p>手机与电脑连接同一局域网，双向合并阅读问题、Markdown 记录和独立待办。</p>
      <p className="muted">
        手动同步正文、图片和录音。附件分块校验，未传完可再次同步；冲突保留双方版本。导入书籍、成长进度和永久删除暂不同步。
      </p>
      {mobile ? (
        <>
          <label>
            电脑配对码
            <textarea
              className="textarea"
              value={pairing}
              onChange={(e) => setPairing(e.target.value)}
              placeholder="粘贴电脑「设置 → 设备同步」中的配对码"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={busy || disabled || !pairing.trim()}
            onClick={() =>
              void run(async () => {
                if (!window.api.sync.exchange) throw Error('需要更新移动端')
                const result = await window.api.sync.exchange(pairing)
                setConflicts(result.conflicts)
                setMessage(
                  `本轮核对 ${result.count} 项，${result.conflicts.length} 项冲突已保留两份。本轮附件传输 ${result.attachments?.transferred ?? 0} 个，待重试 ${result.attachments?.pending ?? 0} 个。${result.attachments?.errors.join('；') ?? ''}`
                )
                window.dispatchEvent(new Event('sessions-changed'))
                window.dispatchEvent(new Event('journal-synced'))
                onSynced?.()
              })
            }
          >
            {busy ? '正在同步…' : '立即同步'}
          </button>
          {conflicts.map((c) => (
            <details key={c.key}>
              <summary>
                已保留两份：
                {c.local.kind === 'session'
                  ? c.local.value.session.title
                  : c.local.kind === 'note'
                    ? c.local.value.title
                    : c.local.kind === 'action'
                      ? c.local.value.text
                      : c.local.value.name}
              </summary>
              <p>
                已生成可编辑的「同步冲突副本」。请到记录、问题或待办中自行编辑、合并或删除，后续同步不会替你选择。
              </p>
              <h3>手机版本</h3>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>
                {text(c.local)}
              </pre>
              <h3>电脑版本</h3>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>
                {text(c.remote)}
              </pre>
            </details>
          ))}
        </>
      ) : (
        <>
          <button
            className="btn btn-primary"
            disabled={busy || disabled}
            onClick={() =>
              void run(async () => {
                setStatus(await (status.running ? window.api.sync.stop() : window.api.sync.start()))
              })
            }
          >
            {busy ? '处理中…' : status.running ? '关闭并撤销当前配对码' : '开启局域网同步'}
          </button>
          {status.running && (
            <>
              <p>请只把配对码交给自己的手机。关闭服务或重启后旧码失效。</p>
              {status.pairing.map((code) => (
                <textarea
                  key={code}
                  className="textarea"
                  readOnly
                  aria-label="电脑配对码"
                  value={code}
                  onFocus={(e) => e.target.select()}
                />
              ))}
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {(error || status.error) && (
        <p role="alert" className="error-text">
          {error || status.error}
        </p>
      )}
    </section>
  )
}
