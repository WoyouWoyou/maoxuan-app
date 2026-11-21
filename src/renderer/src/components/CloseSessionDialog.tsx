import { useEffect, useId, useRef, useState } from 'react'
import type { SessionSummary } from '@shared/types'
import { TRASH_RETENTION_DAYS } from '@shared/core'
import './CloseSessionDialog.css'

export interface CloseSessionDialogProps {
  mobile?: boolean
  session: SessionSummary
  onClose: () => void
  onDone: (action: 'trash' | 'archive') => void
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function CloseSessionDialog({ session, mobile, onClose, onDone }: CloseSessionDialogProps) {
  const [busy, setBusy] = useState<'trash' | 'archive' | null>(null)
  const [error, setError] = useState('')
  const titleId = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    return () => previous?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

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
    <div
      className="csd-mask"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className={`csd-card ${mobile ? 'csd-mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="csd-title" id={titleId}>
          关闭这个问题？
        </h3>

        <div className="csd-problem serif">{session.title}</div>

        <p className="csd-note">
          {mobile ? (
            '归档和移入回收站都会将问题及相关待办从当前列表收起。可到「我的 → 问题归档与回收站」恢复。'
          ) : (
            <>
              归档：收起问题及其四象限待办，取消归档后恢复，随时可在「设置 → 已归档」找回。回收站：
              {TRASH_RETENTION_DAYS} 天后彻底删除，期间可在「设置 → 回收站」恢复。
            </>
          )}
        </p>

        {error ? (
          <div className="error-text csd-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="csd-actions">
          <button
            type="button"
            className="btn btn-ghost"
            ref={cancel}
            onClick={onClose}
            disabled={busy !== null}
          >
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
            {mobile ? '移入回收站' : `移入回收站（${TRASH_RETENTION_DAYS} 天后彻底删除）`}
          </button>
        </div>
      </div>
    </div>
  )
}
