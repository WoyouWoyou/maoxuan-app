import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ActionItem, ActionProgress, ActionStatus, Reading, SessionData } from '@shared/types'
import { MINDSET_QUESTIONS, MOTTO } from '@shared/core'
import { ActionProgressLog } from '../ActionProgressLog'
import type { StepProps } from './types'
import './steps.css'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function makeReading(articleId: string, title: string): Reading {
  return {
    articleId,
    title,
    startedAt: new Date().toISOString(),
    focusQuestion: '',
    passages: [],
    reflections: [],
    readDone: false,
    notes: { coreMethod: '', relatedProblem: '', action: '' },
    feedback: null,
    notesDone: false
  }
}

function statusLabel(status: ActionStatus): string {
  if (status === 'done') return '已完成'
  if (status === 'dropped') return '已放弃'
  return '待做'
}

export function StepApply({ session, save, update, openReader }: StepProps) {
  const data = session.data
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'review' | 'mindset' | null>(null)
  const [err, setErr] = useState('')
  const [newSituation, setNewSituation] = useState('')
  const [newAction, setNewAction] = useState('')
  const [openReview, setOpenReview] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.articles
      .list()
      .then(list => {
        if (!alive) return
        const map: Record<string, string> = {}
        for (const item of list) map[item.id] = item.title
        setTitles(map)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  function titleOf(articleId: string): string {
    const found = data.readings.find(r => r.articleId === articleId)
    return found?.title ?? titles[articleId] ?? articleId
  }

  async function setStatus(item: ActionItem, status: ActionStatus) {
    const actions = data.actions.map(a => (a.id === item.id ? { ...a, status } : a))
    const label = status === 'done' ? '第四步：完成行动' : status === 'dropped' ? '第四步：放弃行动' : '第四步：更新行动'
    await save({ ...data, actions }, { versionLabel: label })
  }

  async function setDue(item: ActionItem, dueDate: string) {
    const actions = data.actions.map(a => (a.id === item.id ? { ...a, dueDate } : a))
    await save({ ...data, actions }, { versionLabel: '第四步：更新行动' })
  }

  async function setResult(item: ActionItem, result: string) {
    if (result === item.result) return
    const actions = data.actions.map(a => (a.id === item.id ? { ...a, result } : a))
    await save({ ...data, actions })
  }

  async function addAction() {
    const text = newAction.trim()
    if (!text) return
    const item: ActionItem = {
      id: crypto.randomUUID(),
      text,
      fromArticleId: null,
      dueDate: tomorrow(),
      status: 'todo',
      result: '',
      progress: [],
      createdAt: new Date().toISOString()
    }
    setNewAction('')
    await save({ ...data, actions: [...data.actions, item] }, { versionLabel: '第四步：更新行动' })
  }

  async function addProgress(actionId: string, text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const entry: ActionProgress = {
      id: crypto.randomUUID(),
      text: trimmed,
      createdAt: new Date().toISOString()
    }
    await update(
      latest => ({
        ...latest,
        actions: latest.actions.map(a => (a.id === actionId ? { ...a, progress: [...(a.progress ?? []), entry] } : a))
      }),
      { versionLabel: '第四步：记录阶段进展' }
    )
  }

  async function editProgress(actionId: string, progressId: string, text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    await update(
      latest => ({
        ...latest,
        actions: latest.actions.map(a =>
          a.id === actionId
            ? { ...a, progress: (a.progress ?? []).map(p => (p.id === progressId ? { ...p, text: trimmed } : p)) }
            : a
        )
      }),
      { versionLabel: '第四步：修改阶段进展' }
    )
  }

  async function removeProgress(actionId: string, progressId: string) {
    await update(
      latest => ({
        ...latest,
        actions: latest.actions.map(a =>
          a.id === actionId ? { ...a, progress: (a.progress ?? []).filter(p => p.id !== progressId) } : a
        )
      }),
      { versionLabel: '第四步：删除阶段进展' }
    )
  }

  async function doReview() {
    const situation = newSituation.trim()
    if (situation.length < 5) {
      setErr('把新情况写得再具体一点')
      return
    }
    setBusy('review')
    setErr('')
    try {
      const review = await window.api.ai.reviewSituation(session.id, situation)
      await update(latest => ({ ...latest, reviews: [...latest.reviews, review] }), {
        versionLabel: '第四步：新情况复盘'
      })
      setNewSituation('')
      setOpenReview(review.id)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function openReread(articleId: string) {
    if (!data.readings.some(r => r.articleId === articleId)) {
      const loaded = await window.api.articles.get(articleId)
      const title = loaded?.title ?? titles[articleId] ?? articleId
      await update(latest =>
        latest.readings.some(r => r.articleId === articleId)
          ? latest
          : { ...latest, readings: [...latest.readings, makeReading(articleId, title)] }
      )
    }
    openReader(articleId)
  }

  async function genMindset() {
    setBusy('mindset')
    setErr('')
    try {
      const mindset = await window.api.ai.mindset(session.id)
      await update(latest => ({ ...latest, mindset }), { versionLabel: '第四步：心法三问' })
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const mindsetAnswers = data.mindset ? [data.mindset.mainContradiction, data.mindset.stage, data.mindset.firstStep] : []
  const reviews = [...data.reviews].reverse()
  const t = today()
  const savedData: SessionData = data

  return (
    <div className="step-apply scroll">
      {err && <div className="error-text">{err}</div>}

      <section className="apply-section">
        <div className="apply-section-title">
          行动清单
          <span className="muted">写完笔记只是半程，干完才算数。</span>
        </div>

        {savedData.actions.length === 0 && <div className="muted">还没有行动。回到第三步保存笔记，会自动生成一条。</div>}

        {savedData.actions.map(item => {
          const overdue = item.status === 'todo' && item.dueDate < t
          const progress = item.progress ?? []
          return (
            <div className={`apply-action${overdue ? ' is-overdue' : ''}`} key={item.id}>
              <div className="apply-action-head">
                <span className="apply-action-text">{item.text}</span>
                {item.fromArticleId && <span className="badge">{titleOf(item.fromArticleId)}</span>}
                {overdue && <span className="badge badge-red">已逾期</span>}
                <span className="spacer" />
                <span className={item.status === 'done' ? 'badge badge-ok' : 'badge'}>{statusLabel(item.status)}</span>
                {progress.length > 0 && <span className="badge">{progress.length} 个阶段</span>}
              </div>
              <div className="apply-action-meta">
                <label className="muted">
                  截止日
                  <input
                    type="date"
                    className="input apply-date"
                    value={item.dueDate}
                    onChange={e => {
                      const value = e.target.value
                      if (!value) return
                      void setDue(item, value)
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={item.status === 'done'}
                  onClick={() => void setStatus(item, 'done')}
                >
                  完成
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={item.status === 'dropped'}
                  onClick={() => void setStatus(item, 'dropped')}
                >
                  放弃
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={item.status === 'todo'}
                  onClick={() => void setStatus(item, 'todo')}
                >
                  恢复
                </button>
              </div>

              <ActionProgressLog
                progress={progress}
                disabled={item.status === 'dropped'}
                onAdd={text => addProgress(item.id, text)}
                onEdit={(id, text) => editProgress(item.id, id, text)}
                onRemove={id => removeProgress(item.id, id)}
              />

              <textarea
                className="textarea"
                rows={2}
                defaultValue={item.result}
                placeholder="全部做完后，写下最终结果（失焦自动保存）"
                onBlur={e => void setResult(item, e.target.value)}
              />
            </div>
          )
        })}

        <div className="apply-add">
          <input
            className="input"
            value={newAction}
            placeholder="手动加一条行动，例如：明天上午列出全部债务清单"
            onChange={e => setNewAction(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void addAction()
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!newAction.trim()} onClick={() => void addAction()}>
            添加
          </button>
        </div>
      </section>

      <section className="apply-section">
        <div className="apply-section-title">
          遇到新难题
          <span className="muted">局面变了，就回到第二步重读。</span>
        </div>
        <textarea
          className="textarea"
          rows={3}
          value={newSituation}
          placeholder="例：房东突然要涨租，原来的还债计划要全部重排。"
          onChange={e => {
            setNewSituation(e.target.value)
          }}
        />
        <div className="step-actions-bar">
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void doReview()}>
            {busy === 'review' && <span className="spinner" />} 请教练建议重读哪篇
          </button>
          <span className="muted">教练只推荐篇目，不会替你总结。</span>
        </div>

        {reviews.length > 0 && (
          <div className="apply-reviews">
            {reviews.map(review => (
              <div className="apply-review" key={review.id}>
                <button
                  type="button"
                  className="apply-review-head"
                  onClick={() => setOpenReview(openReview === review.id ? null : review.id)}
                >
                  <span className="apply-review-time muted">{new Date(review.createdAt).toLocaleString('zh-CN')}</span>
                  <span className="apply-review-situation">{review.newSituation}</span>
                  <span className="muted">{openReview === review.id ? '收起' : '展开'}</span>
                </button>
                {openReview === review.id && (
                  <div className="apply-review-body">
                    <div className="apply-advice">
                      <ReactMarkdown>{review.advice}</ReactMarkdown>
                    </div>
                    {review.rereadArticleIds.length > 0 && (
                      <div className="apply-reread">
                        <span className="muted">建议重读：</span>
                        {review.rereadArticleIds.map(articleId => (
                          <button
                            key={articleId}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void openReread(articleId)}
                          >
                            重读《{titleOf(articleId)}》
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="apply-section">
        <div className="apply-section-title">
          心法三问
          <span className="muted">把这一轮的东西压成三句话。</span>
        </div>
        <div className="step-actions-bar">
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void genMindset()}>
            {busy === 'mindset' && <span className="spinner" />} {data.mindset ? '重新生成我的心法三问' : '生成我的心法三问'}
          </button>
          {data.mindset && <span className="muted">生成于 {new Date(data.mindset.generatedAt).toLocaleString('zh-CN')}</span>}
        </div>

        {data.mindset ? (
          <div className="apply-mindset">
            {MINDSET_QUESTIONS.map((question, i) => (
              <div className="apply-mindset-card" key={question}>
                <div className="apply-mindset-q">{question}</div>
                <div className="apply-mindset-a serif">{mindsetAnswers[i]}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">还没有心法。先干完一件事，再来生成。</div>
        )}

        <p className="apply-motto serif">{MOTTO}</p>
      </section>
    </div>
  )
}
