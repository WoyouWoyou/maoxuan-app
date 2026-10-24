import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { MODE_META, type SessionMode } from '@shared/types'
import { useBooks } from '../features/library/useBooks'
import './NewSessionDialog.css'

const MIN_NAME_LENGTH = 2
const MAX_NAME_LENGTH = 20
const MODES: SessionMode[] = ['reading', 'workbench']
const MODE_DESCRIPTIONS: Record<SessionMode, string> = {
  reading: '带着问题读原文，写下自己的理解。',
  workbench: '带着项目做决策，把事实转成行动。'
}

interface NewSessionDialogProps {
  initialMode: SessionMode
  initialBookId: string
  onClose: () => void
  onCreated: (id: string) => void
  onImport: () => void
}

export function NewSessionDialog({
  initialMode,
  initialBookId,
  onClose,
  onCreated,
  onImport
}: NewSessionDialogProps) {
  const books = useBooks()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const [mode, setMode] = useState(initialMode)
  const [bookId, setBookId] = useState(initialBookId)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const length = Array.from(name.trim()).length
  const canSubmit =
    length >= MIN_NAME_LENGTH &&
    length <= MAX_NAME_LENGTH &&
    !busy &&
    (mode === 'workbench' || books.some((book) => book.bookId === bookId))

  useEffect(() => {
    const dialog = dialogRef.current!
    const previousFocus = document.activeElement
    dialog.showModal()
    inputRef.current?.focus()
    return () => {
      dialog.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  async function submit() {
    if (!canSubmit || submittingRef.current) return
    submittingRef.current = true
    setBusy(true)
    setError('')
    try {
      const session = await window.api.sessions.create(name.trim(), mode, bookId)
      onCreated(session.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="nsd"
      aria-labelledby="nsd-title"
      aria-describedby="nsd-subtitle"
      onCancel={(event) => {
        event.preventDefault()
        if (!submittingRef.current) onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || submittingRef.current) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <header className="nsd-header">
          <h2 id="nsd-title">新增一个头疼的问题</h2>
          <button
            type="button"
            className="nsd-close"
            aria-label="关闭新增问题弹窗"
            disabled={busy}
            onClick={onClose}
          >
            <X size={24} />
          </button>
          <p id="nsd-subtitle">带着问题读原文，找到行动的方向。</p>
        </header>

        <div className="nsd-name-field">
          <label htmlFor="nsd-name">问题名称</label>
          <div className="nsd-name-control">
            <input
              ref={inputRef}
              id="nsd-name"
              className="input"
              autoComplete="off"
              placeholder="例如：和同事沟通不畅"
              value={name}
              disabled={busy}
              aria-describedby="nsd-name-hint nsd-name-count"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault()
              }}
            />
            <span
              id="nsd-name-count"
              className={length > MAX_NAME_LENGTH ? 'nsd-count is-over' : 'nsd-count'}
            >
              {length} / {MAX_NAME_LENGTH}
            </span>
          </div>
          <p
            id="nsd-name-hint"
            className={length > MAX_NAME_LENGTH ? 'nsd-hint is-over' : 'nsd-hint'}
          >
            {length > MAX_NAME_LENGTH
              ? '问题名称最多 20 个字，请精简后再开始。'
              : '建议 2–10 个字，最多 20 个字。'}
          </p>
        </div>

        <div className="nsd-modes" role="group" aria-label="使用方式">
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              className={item === mode ? 'nsd-mode is-on' : 'nsd-mode'}
              aria-pressed={item === mode}
              disabled={busy}
              onClick={() => setMode(item)}
            >
              <span className="nsd-mode-name">{MODE_META[item].name}</span>
              <span className="nsd-mode-desc">{MODE_DESCRIPTIONS[item]}</span>
            </button>
          ))}
        </div>

        {mode === 'reading' && (
          <div className="nsd-book-field">
            <label htmlFor="nsd-book">选择书籍</label>
            <div className="nsd-book-row">
              <select
                id="nsd-book"
                className="input"
                value={bookId}
                disabled={busy}
                onChange={(event) => setBookId(event.target.value)}
              >
                {!books.length && <option value="">正在加载书籍…</option>}
                {books.map((book) => (
                  <option key={book.bookId} value={book.bookId}>
                    {book.title}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={onImport}>
                导入其他书籍
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="error-text nsd-error" role="alert">
            {error}
          </p>
        )}
        <footer className="nsd-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {busy && <span className="spinner" />}
            {busy ? '正在创建…' : '开始'}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body
  )
}
