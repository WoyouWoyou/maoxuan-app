import { useEffect, useState } from 'react'
import type { Article, Reflection } from '@shared/types'
import './ReflectionPanel.css'

export interface ReflectionPanelProps {
  article: Article
  reflections: Reflection[]
  activeParagraph: number | null
  onClearParagraph: () => void
  onAdd: (r: Reflection) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onJump: (paragraphIndex: number) => void
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function ReflectionPanel({
  article,
  reflections,
  activeParagraph,
  onClearParagraph,
  onAdd,
  onRemove,
  onJump
}: ReflectionPanelProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    setConfirmId(null)
  }, [article.id])

  const sorted = reflections.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const linkQuote = activeParagraph !== null ? clip(article.paragraphs[activeParagraph] ?? '', 40) : ''
  const canSave = text.trim().length > 0 && !saving

  async function save() {
    const value = text.trim()
    if (!value || saving) return
    setSaving(true)
    setErr('')
    const idx = activeParagraph
    const record: Reflection = {
      id: crypto.randomUUID(),
      paragraphIndex: idx,
      quote: idx !== null ? (article.paragraphs[idx] ?? '').slice(0, 80) : '',
      text: value,
      createdAt: new Date().toISOString()
    }
    try {
      await onAdd(record)
      setText('')
      onClearParagraph()
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (removingId) return
    setRemovingId(id)
    setErr('')
    try {
      await onRemove(id)
      setConfirmId(null)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section className="refl-panel">
      <header className="refl-head">
        <h3 className="refl-title">阅读感悟</h3>
        <span className="refl-sub">读到哪有想法就记下来，第三步会用到</span>
      </header>

      <div className="refl-link">
        {activeParagraph !== null ? (
          <>
            <span className="refl-link-text">
              关联：第 {activeParagraph + 1} 段 · {linkQuote}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearParagraph}>
              取消关联
            </button>
          </>
        ) : (
          <span className="muted">点击原文左侧段落编号可关联到这一段</span>
        )}
      </div>

      <div className="refl-body">
        <textarea
          className="textarea refl-input"
          rows={3}
          value={text}
          placeholder="这段让我想到……"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void save()
            }
          }}
        />

        <div className="refl-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={!canSave} onClick={() => void save()}>
            {saving && <span className="spinner" />} 记下
          </button>
          <span className="muted refl-hint">⌘/Ctrl + Enter 保存</span>
          {err && <span className="error-text">{err}</span>}
        </div>

        {sorted.length === 0 ? (
          <div className="empty refl-empty">还没有感悟</div>
        ) : (
          <div className="refl-list">
            {sorted.map(r => {
              const idx = r.paragraphIndex
              return (
                <div className="refl-item" key={r.id}>
                  <div className="refl-item-head">
                    {idx !== null ? (
                      <button type="button" className="refl-no" onClick={() => onJump(idx)}>
                        第 {idx + 1} 段
                      </button>
                    ) : (
                      <span className="refl-no is-plain">随手记</span>
                    )}
                    <span className="muted refl-time">{timeOf(r.createdAt)}</span>
                    <span className="spacer" />
                    {confirmId === r.id ? (
                      <span className="refl-confirm">
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={removingId === r.id}
                          onClick={() => void remove(r.id)}
                        >
                          {removingId === r.id && <span className="spinner" />} 确认删除
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>
                          取消
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(r.id)}>
                        删除
                      </button>
                    )}
                  </div>
                  <div className="refl-text">{r.text}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
