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
  const confirmDialog = useRef<HTMLDialogElement>(null)
  const saveInFlight = useRef(false)
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
  const [generating, setGenerating] = useState(false)
  const [drafted, setDrafted] = useState(false)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const selected: Reading | null =
    readReadings.find((r) => r.articleId === selectedId) ?? readReadings[0] ?? null

  useEffect(() => {
    edits.current++
    setDrafted(false)
    setErr('')
    const target = readReadings.find((r) => r.articleId === selectedId) ?? readReadings[0]
    setNotes(target ? target.notes : EMPTY_NOTES)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (selected && selected.articleId !== focusArticleId) setFocusArticleId(selected.articleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.articleId])

  useEffect(
    () => () => {
      edits.current++
    },
    [session.id]
  )

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

  const working = busy || generating || saving
  const hasReflections = reflections.some((r) => r.text.trim())

  async function fillFromNotes() {
    if (!selected || working || !hasReflections) return
    const requestedEdits = edits.current
    setGenerating(true)
    setErr('')
    try {
      const result = await window.api.ai.draftNotes(session.id, selected.articleId)
      if (edits.current !== requestedEdits)
        throw new Error('笔记草稿已修改，未覆盖当前内容，请重新辅助填写')
      edits.current++
      setNotes(result)
      setDrafted(true)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setGenerating(false)
    }
  }

  function setField(key: keyof ThreeNotes, value: string) {
    edits.current++
    setNotes((prev) => {
      const next: ThreeNotes = { ...prev }
      next[key] = value
      return next
    })
  }

  async function review() {
    const current = selected
    if (!current || !filled || working) return
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
    if (!current || !filled || working || saveInFlight.current) return
    saveInFlight.current = true
    setSaving(true)
    setErr('')
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
    try {
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
      confirmDialog.current?.close()
      goStep('apply')
    } catch (e) {
      confirmDialog.current?.close()
      setErr(toMessage(e))
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
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
                disabled={working}
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

        <div className="muted relate-tip">
          先看自己的感悟，再写下面 3 条；也可以根据笔记 AI 辅助填写。
        </div>
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
              disabled={saving}
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
          className="btn btn-ghost"
          disabled={!hasReflections || working}
          onClick={() => void fillFromNotes()}
        >
          {generating && <span className="spinner" />}
          {generating ? '正在根据笔记整理…' : '根据笔记 AI 辅助填写'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!filled || working}
          onClick={() => void review()}
        >
          {busy && <span className="spinner" />} 请教员批改
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!filled || working}
          onClick={() => {
            if (drafted) confirmDialog.current?.showModal()
            else void saveNotes()
          }}
        >
          {saving ? '正在保存…' : '保存笔记后进入行动'}
        </button>
        {!filled && <span className="muted">可以先回顾原文和自己的感受，再写一个小的尝试</span>}
        {err && <span className="error-text">{err}</span>}
      </div>

      <dialog
        ref={confirmDialog}
        className="relate-save-dialog"
        aria-labelledby="relate-save-title"
        aria-describedby="relate-save-description"
        onCancel={(event) => {
          if (saving) event.preventDefault()
        }}
      >
        <h2 id="relate-save-title">确认 AI 辅助笔记</h2>
        <p id="relate-save-description">
          这三条内容经过 AI 辅助填写。请确认它们符合你的真实想法，且具体行动是你愿意执行的。
          确认后将保存笔记，并把第 3 条加入行动清单，进入行动页。
        </p>
        <div className="step-actions-bar">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={saving}
            onClick={() => confirmDialog.current?.close()}
            autoFocus
          >
            返回修改
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void saveNotes()}
          >
            {saving ? '正在保存…' : '确认保存并进入行动'}
          </button>
        </div>
      </dialog>

      <div className="muted relate-tip" role="status">
        {!hasReflections
          ? '先在第二步记下阅读感悟，就可以根据笔记 AI 辅助填写。'
          : drafted
            ? '已根据你的笔记填写三个框。请核对并修改，再请教员批改或保存笔记。'
            : 'AI 会根据本篇笔记重新填写上面三个框，请核对后再批改或保存。'}
      </div>

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
        <div className="muted relate-tip">
          批改通过。点“保存笔记后进入行动”，第 3 条会自动加入行动清单并进入行动页。
        </div>
      )}
    </div>
  )
}
