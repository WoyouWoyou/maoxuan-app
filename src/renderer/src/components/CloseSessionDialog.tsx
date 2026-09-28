import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/types'
import { TRASH_RETENTION_DAYS } from '@shared/core'
import './CloseSessionDialog.css'

export interface CloseSessionDialogProps {
  session: SessionSummary
  onClose: () => void
  onDone: (action: 'trash' | 'archive') => void
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function CloseSessionDialog({ session, onClose, onDone }: CloseSessionDialogProps) {
  const [busy, setBusy] = useState<'trash' | 'archive' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(action: 'trash' | 'archive') {
    if (busy) return
    setError('')
    setBusy(action)
    try {
      if (action === 'archive') await window.api.sessions.archive(session.id)
      else await window.api.sessions.trash(session.id)
      onDone(action)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="csd-mask" onClick={onClose}>
      <div className="csd-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="csd-title">关闭这个问题？</h3>

        <div className="csd-problem serif">{session.title}</div>

        <p className="csd-note">
          归档：从列表中收起，随时可在「设置 → 已归档」找回。回收站：{TRASH_RETENTION_DAYS} 天后彻底删除，期间可在「设置
          → 回收站」恢复。
        </p>

        {error ? <div className="error-text csd-error">{error}</div> : null}

        <div className="csd-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy !== null}>
            取消
          </button>
          <button
            type="button"
            className="btn csd-btn-archive"
            onClick={() => void run('archive')}
            disabled={busy !== null}
          >
            {busy === 'archive' ? <span className="spinner" /> : null}
            归档
          </button>
          <button
            type="button"
            className="btn csd-btn-trash"
            onClick={() => void run('trash')}
            disabled={busy !== null}
          >
            {busy === 'trash' ? <span className="spinner" /> : null}
            移入回收站（{TRASH_RETENTION_DAYS} 天后彻底删除）
          </button>
        </div>
      </div>
    </div>
  )
}
