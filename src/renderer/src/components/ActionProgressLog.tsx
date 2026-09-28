import { useRef, useState } from 'react'
import type { ActionProgress } from '@shared/types'
import './ActionProgressLog.css'

export interface ActionProgressLogProps {
  progress: ActionProgress[]
  /** 行动已放弃时只读 */
  disabled?: boolean
  onAdd: (text: string) => Promise<void>
  onEdit: (id: string, text: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function ActionProgressLog({ progress, disabled = false, onAdd, onEdit, onRemove }: ActionProgressLogProps) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const composing = useRef(false)

  const ordered = [...progress].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const latest = ordered.length > 0 ? ordered[ordered.length - 1] : null

  async function submit() {
    const text = draft.trim()
    if (!text || adding || disabled) return
    setAdding(true)
    setErr('')
    try {
      await onAdd(text)
      setDraft('')
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setAdding(false)
    }
  }

  async function saveEdit(id: string) {
    const text = editText.trim()
    if (!text || saving) return
    setSaving(true)
    setErr('')
    try {
      await onEdit(id, text)
      setEditingId(null)
      setEditText('')
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (saving) return
    setSaving(true)
    setErr('')
    try {
      await onRemove(id)
      setConfirmId(null)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="prog">
      <div className="prog-head">
        <span className="prog-title">阶段进展</span>
        <span className="prog-hint muted">不是一下子能干完的，做完一段记一段</span>
        <span className="spacer" />
        <span className="prog-count muted">
          已完成 {ordered.length} 个阶段
          {latest && ` · 最近：${formatDay(latest.createdAt)}`}
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="prog-empty muted">还没有阶段记录</div>
      ) : (
        <ol className="prog-list">
          {ordered.map((item, i) => (
            <li className="prog-item" key={item.id}>
              <span className="prog-dot" />
              <div className="prog-body">
                <div className="prog-meta">
                  <span className="prog-stage">第 {i + 1} 阶段</span>
                  <span className="prog-time muted">{formatTime(item.createdAt)}</span>
                  {!disabled && editingId !== item.id && confirmId !== item.id && (
                    <span className="prog-tools">
                      <button
                        type="button"
                        className="prog-tool"
                        onClick={() => {
                          setEditingId(item.id)
                          setEditText(item.text)
                          setConfirmId(null)
                        }}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="prog-tool"
                        onClick={() => {
                          setConfirmId(item.id)
                          setEditingId(null)
                        }}
                      >
                        删除
                      </button>
                    </span>
                  )}
                </div>

                {editingId === item.id ? (
                  <div className="prog-edit">
                    <textarea
                      className="textarea prog-edit-input"
                      rows={2}
                      value={editText}
                      onChange={e => {
                        setEditText(e.target.value)
                      }}
                    />
                    <div className="prog-edit-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={!editText.trim() || saving}
                        onClick={() => void saveEdit(item.id)}
                      >
                        {saving && <span className="spinner" />} 保存
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={saving}
                        onClick={() => {
                          setEditingId(null)
                          setEditText('')
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="prog-text">{item.text}</div>
                )}

                {confirmId === item.id && (
                  <div className="prog-confirm">
                    <span>删除这条阶段记录？</span>
                    <button type="button" className="btn btn-sm btn-danger" disabled={saving} onClick={() => void remove(item.id)}>
                      {saving && <span className="spinner" />} 删除
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={() => setConfirmId(null)}>
                      取消
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!disabled && (
        <div className="prog-add">
          <input
            className="input prog-add-input"
            value={draft}
            placeholder="这一阶段完成了什么？例如：先把现有字段整理好了"
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onChange={e => {
              setDraft(e.target.value)
            }}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              if (composing.current || e.nativeEvent.isComposing) return
              e.preventDefault()
              void submit()
            }}
          />
          <button type="button" className="btn btn-sm btn-ghost" disabled={!draft.trim() || adding} onClick={() => void submit()}>
            {adding && <span className="spinner" />} 记一笔
          </button>
        </div>
      )}

      {err && <div className="error-text prog-err">{err}</div>}
    </div>
  )
}
