import { useEffect, useRef, useState } from 'react'
import type { ActionItem, Reading, ThreeNotes } from '@shared/types'
import { exampleFor, NOTE_FIELDS } from '@shared/core'
import { NoteExampleCard } from '../NoteExampleCard'
import type { StepProps } from './types'
import './steps.css'
import './RelatePicker.css'
import { readingPresentation } from '@shared/reading-presentation'

const EMPTY_NOTES: ThreeNotes = { coreMethod: '', relatedProblem: '', action: '' }

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function StepRelate({
  session,
  goStep,
  openReader,
  focusArticleId,
  setFocusArticleId,
  update
}: StepProps) {
  const edits = useRef(0)
  const data = session.data
  const presentation = readingPresentation(data)
  const readReadings = data.readings.filter((r) => r.readDone)
  const preferred =
    focusArticleId && readReadings.some((r) => r.articleId === focusArticleId)
      ? focusArticleId
      : (readReadings[0]?.articleId ?? '')
  const [selectedId, setSelectedId] = useState(preferred)
  const [notes, setNotes] = useState<ThreeNotes>(EMPTY_NOTES)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)

  const selected: Reading | null =
    readReadings.find((r) => r.articleId === selectedId) ?? readReadings[0] ?? null

  useEffect(() => {
    const target = readReadings.find((r) => r.articleId === selectedId) ?? readReadings[0]
    setNotes(target ? target.notes : EMPTY_NOTES)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (selected && selected.articleId !== focusArticleId) setFocusArticleId(selected.articleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.articleId])

  if (!selected) {
    return (
      <div className="step-relate scroll">
        <div className="empty">还没有读完的文章。回到第二步，精读一篇，点“我读完了”。</div>
      </div>
    )
  }

  const filled =
    notes.coreMethod.trim().length > 0 &&
    notes.relatedProblem.trim().length > 0 &&
    notes.action.trim().length > 0
  const feedback = selected.feedback
  const reflections = (selected.reflections ?? [])
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  function setField(key: keyof ThreeNotes, value: string) {
    edits.current++
    setNotes((prev) => {
      const next: ThreeNotes = { ...prev }
      next[key] = value
      return next
    })
    setSaved(false)
  }

  async function review() {
    const current = selected
    if (!current || !filled || busy) return
    const articleId = current.articleId
    const title = current.title
    const requestedEdits = edits.current
    setBusy(true)
    setErr('')
    try {
      await update((latest) => ({
        ...latest,
        readings: latest.readings.map((r) => (r.articleId === articleId ? { ...r, notes } : r))
      }))
      const result = await window.api.ai.reviewNotes(session.id, articleId, notes)
      if (edits.current !== requestedEdits) throw new Error('笔记草稿已修改，请重新获取反馈')
      await update(
        (latest) => ({
          ...latest,
          readings: latest.readings.map((r) =>
            r.articleId === articleId ? { ...r, notes, feedback: result } : r
          )
        }),
        { versionLabel: `第三步：批改《${title}》笔记` }
      )
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveNotes() {
    const current = selected
    if (!current || !filled || busy) return
    const articleId = current.articleId
    const title = current.title
    const actionText = notes.action.trim()
    const newAction: ActionItem = {
      id: crypto.randomUUID(),
      text: actionText,
      fromArticleId: articleId,
      dueDate: tomorrow(),
      status: 'todo',
      result: '',
      progress: [],
      createdAt: new Date().toISOString()
    }
    await update(
      (latest) => {
        const exists = latest.actions.some(
          (a) => a.fromArticleId === articleId && a.text.trim() === actionText
        )
        return {
          ...latest,
          readings: latest.readings.map((r) =>
            r.articleId === articleId ? { ...r, notes, notesDone: true } : r
          ),
          actions: exists ? latest.actions : [...latest.actions, newAction]
        }
      },
      { versionLabel: `第三步：《${title}》3 条笔记`, step: 'apply' }
    )
    setSaved(true)
  }

  return (
    <div className="step-relate scroll">
      <div className="rp-picker">
        <div className="rp-head">
          <div className="rp-title">先选一篇已读的文章</div>
          <div className="rp-sub">
            共 {readReadings.length} 篇已读 · 已写笔记{' '}
            {readReadings.filter((r) => r.notesDone).length} 篇
          </div>
        </div>
        <div className="rp-list">
          {readReadings.map((r) => {
            const isOn = r.articleId === selected.articleId
            return (
              <button
                key={r.articleId}
                type="button"
                className={`rp-item${isOn ? ' is-on' : ''}`}
                onClick={() => {
                  setSelectedId(r.articleId)
                  setFocusArticleId(r.articleId)
                }}
              >
                {isOn && <span className="rp-flag">正在写</span>}
                <span className="rp-item-title">{r.title}</span>
                <span className={`rp-item-status${r.notesDone ? ' is-ok' : ''}`}>
                  {r.notesDone ? '✓ 已有笔记' : '待写 3 条'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card relate-refl">
        <div className="card-title">我读时写下的感悟（{reflections.length} 条）</div>

        {reflections.length === 0 ? (
          <div className="relate-refl-empty">
            <span className="muted">第二步没有留下感悟。可以回去边读边记，再来写 3 条。</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => openReader(selected.articleId)}
            >
              回去读原文
            </button>
          </div>
        ) : (
          <div className="relate-refl-list">
            {reflections.map((r) => {
              const idx = r.paragraphIndex
              return (
                <div className="relate-refl-item" key={r.id}>
                  <div className="relate-refl-head">
                    {idx !== null ? (
                      <button
                        type="button"
                        className="relate-refl-no"
                        onClick={() => openReader(selected.articleId, idx)}
                      >
                        第 {idx + 1} 段
                      </button>
                    ) : (
                      <span className="relate-refl-no is-plain">随手记</span>
                    )}
                    <span className="muted relate-refl-time">{timeOf(r.createdAt)}</span>
                  </div>
                  <div className="relate-refl-text">{r.text}</div>
                </div>
              )
            })}
          </div>
        )}

        <div className="muted relate-tip">先看自己的感悟，再写下面 3 条。</div>
      </div>

      {!presentation.generic && <NoteExampleCard articleId={selected.articleId} />}

      <div className="relate-form">
        {(presentation.generic ? presentation.fields : NOTE_FIELDS).map((field) => (
          <div className="field" key={field.key}>
            <div className="relate-field-head">
              <span className="field-label">{field.label}</span>
              <span className="field-hint">{field.guide}</span>
            </div>
            <textarea
              className="textarea"
              rows={2}
              value={notes[field.key]}
              placeholder={
                presentation.generic
                  ? field.guide
                  : `例：${exampleFor(selected.articleId)[field.key]}`
              }
              onChange={(e) => setField(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="step-actions-bar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!filled || busy}
          onClick={() => void review()}
        >
          {busy && <span className="spinner" />} 请教员批改
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!filled || busy}
          onClick={() => void saveNotes()}
        >
          保存笔记
        </button>
        {!filled && <span className="muted">可以先回顾原文和自己的感受，再写一个小的尝试</span>}
        {err && <span className="error-text">{err}</span>}
        {saved && (
          <span className="ok-text">
            已加入行动清单
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => goStep('apply')}
            >
              去干 1 件事 →
            </button>
          </span>
        )}
      </div>

      {!feedback && <div className="muted relate-tip">写完先请教员批改，再看要不要改。</div>}

      {feedback && (
        <div className="card relate-feedback">
          <div className="card-title">
            批改结果
            {feedback.passed ? (
              <span className="badge badge-ok">及格</span>
            ) : (
              <span className="badge badge-red">不及格</span>
            )}
          </div>

          {(presentation.generic ? presentation.fields : NOTE_FIELDS).map((field) => (
            <div className="relate-score" key={field.key}>
              <span className="relate-score-label">{field.label}</span>
              <span className="relate-bar">
                <i
                  style={{ width: `${Math.max(0, Math.min(5, feedback.scores[field.key])) * 20}%` }}
                />
              </span>
              <b>{feedback.scores[field.key]}/5</b>
            </div>
          ))}

          {feedback.comments.length > 0 && (
            <ul className="relate-comments">
              {feedback.comments.map((c, i) => (
                <li key={`${i}-${c}`}>{c}</li>
              ))}
            </ul>
          )}

          {!feedback.passed && (
            <div className="relate-reread">
              <span className="muted">回去重读这几段：</span>
              {feedback.rereadParagraphs.map((idx) => (
                <button
                  key={idx}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openReader(selected.articleId, idx)}
                >
                  第 {idx + 1} 段
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {feedback && feedback.passed && !selected.notesDone && (
        <div className="muted relate-tip">批改通过。点“保存笔记”，第 3 条会自动进入行动清单。</div>
      )}
    </div>
  )
}
