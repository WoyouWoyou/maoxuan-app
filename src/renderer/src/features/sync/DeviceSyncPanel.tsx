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
  onSynced
}: {
  mobile?: boolean
  onSynced?: () => void
}) {
  const [status, setStatus] = useState<SyncStatus>({ running: false, pairing: [] }),
    [pairing, setPairing] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const [conflicts, setConflicts] = useState<
      { key: string; local: SyncDocument; remote: SyncDocument }[]
    >([]),
    [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({})
  useEffect(() => {
    if (!mobile)
      void window.api.sync
        .status()
        .then(setStatus)
        .catch((e) => setError(String(e)))
  }, [mobile])
  async function run(job: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await job()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card" style={{ padding: 20, marginBottom: 20 }} aria-label="设备同步">
      <h2>设备同步</h2>
      <p>手机与电脑连接同一局域网，双向合并阅读问题、Markdown 记录和独立待办。</p>
      <p className="muted">
        本版手动同步文本。附件、导入书籍、成长进度及永久删除暂不跨端传播；冲突保留双方版本。
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
            disabled={busy || !pairing.trim()}
            onClick={() =>
              void run(async () => {
                if (!window.api.sync.exchange) throw Error('需要更新移动端')
                const result = await window.api.sync.exchange(pairing, choices)
                setConflicts(result.conflicts)
                setChoices({})
                setMessage(`本轮核对 ${result.count} 项，${result.conflicts.length} 项冲突待处理`)
                window.dispatchEvent(new Event('sessions-changed'))
                onSynced?.()
              })
            }
          >
            {busy ? '正在同步…' : '立即同步'}
          </button>
          {conflicts.map((c) => (
            <details key={c.key}>
              <summary>冲突：{c.key}</summary>
              <p>双方内容均已保留。选择后点「立即同步」提交；电脑再有修改时会重新提示。</p>
              <h3>手机版本</h3>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>
                {text(c.local)}
              </pre>
              <h3>电脑版本</h3>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>
                {text(c.remote)}
              </pre>
              <label>
                <input
                  type="radio"
                  name={c.key}
                  checked={choices[c.key] === 'local'}
                  onChange={() => setChoices({ ...choices, [c.key]: 'local' })}
                />
                采用手机版本
              </label>
              <label>
                <input
                  type="radio"
                  name={c.key}
                  checked={choices[c.key] === 'remote'}
                  onChange={() => setChoices({ ...choices, [c.key]: 'remote' })}
                />
                采用电脑版本
              </label>
            </details>
          ))}
        </>
      ) : (
        <>
          <button
            className="btn btn-primary"
            disabled={busy}
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
