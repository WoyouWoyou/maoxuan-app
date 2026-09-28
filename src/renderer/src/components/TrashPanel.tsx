import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SessionSummary } from '@shared/types'
import { TRASH_RETENTION_DAYS } from '@shared/core'
import './TrashPanel.css'

const DAY_MS = 86400000

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysLeft(deletedAt: string | null): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS
  const t = new Date(deletedAt).getTime()
  if (Number.isNaN(t)) return TRASH_RETENTION_DAYS
  return Math.max(0, Math.ceil((t + TRASH_RETENTION_DAYS * DAY_MS - Date.now()) / DAY_MS))
}

export function TrashPanel() {
  const [trash, setTrash] = useState<SessionSummary[]>([])
  const [archived, setArchived] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [trashError, setTrashError] = useState('')
  const [archError, setArchError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([window.api.sessions.listTrash(), window.api.sessions.listArchived()])
      setTrash(t)
      setArchived(a)
      setLoadError('')
    } catch (e) {
      setLoadError(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => {
      void load()
    }
    window.addEventListener('sessions-changed', handler)
    return () => window.removeEventListener('sessions-changed', handler)
  }, [load])

  async function run(
    key: string,
    block: 'trash' | 'archive',
    action: () => Promise<unknown>
  ): Promise<boolean> {
    if (busyId) return false
    const setErr = block === 'trash' ? setTrashError : setArchError
    setErr('')
    setBusyId(key)
    try {
      await action()
      window.dispatchEvent(new Event('sessions-changed'))
      return true
    } catch (e) {
      setErr(errText(e))
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function emptyTrash() {
    const ok = await run('empty', 'trash', () => window.api.sessions.emptyTrash())
    if (ok) setConfirmEmpty(false)
  }

  async function removeForever(id: string) {
    const ok = await run(`remove:${id}`, 'trash', () => window.api.sessions.remove(id))
    if (ok) setRemovingId(null)
  }

  return (
    <div className="tp-wrap">
      <section className="card tp-block">
        <header className="tp-head">
          <span className="tp-title">回收站</span>
          <span className="tp-meta muted">
            共 {trash.length} 个 · {TRASH_RETENTION_DAYS} 天后自动彻底删除
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={trash.length === 0 || busyId !== null}
            onClick={() => setConfirmEmpty(true)}
          >
            清空回收站
          </button>
        </header>

        {confirmEmpty ? (
          <div className="tp-confirm-bar">
            <span>确定彻底删除回收站里的 {trash.length} 个问题？此操作不可恢复。</span>
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busyId !== null}
              onClick={() => setConfirmEmpty(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={busyId !== null}
              onClick={() => void emptyTrash()}
            >
              {busyId === 'empty' ? <span className="spinner" /> : null}
              彻底删除
            </button>
          </div>
        ) : null}

        {loading && trash.length === 0 ? (
          <div className="tp-empty muted">
            <span className="spinner" /> 正在加载…
          </div>
        ) : null}

        {!loading && trash.length === 0 ? <div className="tp-empty muted">回收站是空的。</div> : null}

        {trash.map((s) => {
          const d = daysLeft(s.deletedAt)
          return (
            <div className="tp-row" key={s.id}>
              <div className="tp-row-main">
                <div className="tp-row-title serif" title={s.title}>
                  {s.title}
                </div>
                <div className="tp-row-meta muted">
                  删除于 {fmtDate(s.deletedAt ?? s.updatedAt)} · 剩余{' '}
                  <span className={d <= 3 ? 'tp-urgent' : undefined}>{d}</span> 天
                </div>
              </div>

              <div className="tp-row-actions">
                {removingId === s.id ? (
                  <>
                    <span className="tp-confirm-text">确认删除？</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busyId !== null}
                      onClick={() => setRemovingId(null)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busyId !== null}
                      onClick={() => void removeForever(s.id)}
                    >
                      {busyId === `remove:${s.id}` ? <span className="spinner" /> : null}
                      删除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busyId !== null}
                      onClick={() =>
                        void run(`restore:${s.id}`, 'trash', () => window.api.sessions.restore(s.id))
                      }
                    >
                      {busyId === `restore:${s.id}` ? <span className="spinner" /> : null}
                      恢复
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busyId !== null}
                      onClick={() => setRemovingId(s.id)}
                    >
                      彻底删除
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {loadError ? <div className="error-text tp-error">{loadError}</div> : null}
        {trashError ? <div className="error-text tp-error">{trashError}</div> : null}
      </section>

      <section className="card tp-block">
        <header className="tp-head">
          <span className="tp-title">已归档</span>
          <span className="tp-meta muted">共 {archived.length} 个</span>
        </header>

        {loading && archived.length === 0 ? (
          <div className="tp-empty muted">
            <span className="spinner" /> 正在加载…
          </div>
        ) : null}

        {!loading && archived.length === 0 ? <div className="tp-empty muted">没有归档的问题。</div> : null}

        {archived.map((s) => (
          <div className="tp-row" key={s.id}>
            <div className="tp-row-main">
              <div className="tp-row-title serif" title={s.title}>
                {s.title}
              </div>
              <div className="tp-row-meta muted">归档于 {fmtDate(s.updatedAt)}</div>
            </div>

            <div className="tp-row-actions">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busyId !== null}
                onClick={() => navigate(`/session/${s.id}`)}
              >
                打开
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busyId !== null}
                onClick={() =>
                  void run(`unarchive:${s.id}`, 'archive', () => window.api.sessions.unarchive(s.id))
                }
              >
                {busyId === `unarchive:${s.id}` ? <span className="spinner" /> : null}
                取消归档
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busyId !== null}
                onClick={() => void run(`trash:${s.id}`, 'archive', () => window.api.sessions.trash(s.id))}
              >
                {busyId === `trash:${s.id}` ? <span className="spinner" /> : null}
                移入回收站
              </button>
            </div>
          </div>
        ))}

        {archError ? <div className="error-text tp-error">{archError}</div> : null}
      </section>
    </div>
  )
}
