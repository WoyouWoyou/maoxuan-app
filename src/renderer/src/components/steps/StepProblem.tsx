import { useEffect, useRef, useState } from 'react'
import type { ArticleRecommendation, Diagnosis, ProblemInput, Reading } from '@shared/types'
import type { StepProps } from './types'
import './steps.css'
import './StepProblem.css'

type DiagField = 'restated' | 'mainContradiction' | 'stage'

function makeReading(articleId: string, title: string, focusQuestion = ''): Reading {
  return {
    articleId,
    title,
    startedAt: new Date().toISOString(),
    focusQuestion,
    passages: [],
    reflections: [],
    readDone: false,
    notes: { coreMethod: '', relatedProblem: '', action: '' },
    feedback: null,
    notesDone: false
  }
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

interface DiagEditProps {
  label: string
  value: string
  strong?: boolean
  onSave: (value: string) => Promise<void>
}

/** 诊断卡里的可编辑字段：hover 出现“编辑”，保存时记一条“手动修订诊断”版本 */
function DiagEdit({ label, value, strong, onSave }: DiagEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  async function commit() {
    if (busy) return
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(next)
      setEditing(false)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="diag-block sp1-block">
      <div className="diag-label">{label}</div>
      {editing ? (
        <div className="sp1-edit">
          <textarea
            className="textarea sp1-edit-input"
            rows={3}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="sp1-edit-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={() => void commit()}>
              {busy && <span className="spinner" />} 保存
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setDraft(value)
                setErr('')
                setEditing(false)
              }}
            >
              取消
            </button>
            {err && <span className="error-text">{err}</span>}
          </div>
        </div>
      ) : (
        <div className="sp1-view">
          <p className={strong ? 'diag-text diag-strong' : 'diag-text'}>{value}</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm sp1-edit-btn"
            onClick={() => {
              setDraft(value)
              setErr('')
              setEditing(true)
            }}
          >
            编辑
          </button>
        </div>
      )}
    </div>
  )
}

export function StepProblem({ session, save, update, goStep, openReader, openRevise }: StepProps) {
  const [problem, setProblem] = useState<ProblemInput>(session.data.problem)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dirtyRef = useRef(false)

  const data = session.data
  const diagnosis = data.diagnosis
  const tooShort = problem.text.trim().length < 10
  const changed =
    diagnosis !== null &&
    (problem.text !== data.problem.text || problem.background !== data.problem.background || problem.tried !== data.problem.tried)

  // 外部数据（套用讨论结果 / 版本恢复 / 手动修订）变化时同步本地表单，
  // 但用户正在输入且尚未保存时不覆盖。
  useEffect(() => {
    if (dirtyRef.current) return
    const ext = session.data.problem
    setProblem(prev =>
      prev.text === ext.text && prev.background === ext.background && prev.tried === ext.tried
        ? prev
        : { text: ext.text, background: ext.background, tried: ext.tried }
    )
  }, [session.data.problem])

  /** 用户没点诊断就离开时，也别丢掉写了一半的问题 */
  function persistProblem() {
    dirtyRef.current = false
    if (
      problem.text === data.problem.text &&
      problem.background === data.problem.background &&
      problem.tried === data.problem.tried
    ) {
      return
    }
    void update(latest => ({ ...latest, problem }))
  }

  function editProblem(field: keyof ProblemInput, value: string) {
    dirtyRef.current = true
    setProblem(prev => ({ ...prev, [field]: value }))
  }

  async function diagnose() {
    if (tooShort || busy) return
    setBusy(true)
    setErr('')
    try {
      await update(latest => ({ ...latest, problem }))
      const result = await window.api.ai.diagnose(session.id)
      await update(latest => ({ ...latest, problem, diagnosis: result }), { versionLabel: '第一步：教练诊断' })
      dirtyRef.current = false
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (tooShort || !diagnosis || busy) return
    setBusy(true)
    setErr('')
    try {
      await save({ ...data, problem, diagnosis }, { versionLabel: '第一步：明确问题', step: 'focus' })
      dirtyRef.current = false
      goStep('focus')
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function openRecommendation(rec: ArticleRecommendation) {
    const existing = data.readings.find(r => r.articleId === rec.articleId)
    let next = data
    if (!existing) {
      next = { ...data, readings: [...data.readings, makeReading(rec.articleId, rec.title, rec.focusQuestion)] }
    } else if (!existing.focusQuestion && rec.focusQuestion) {
      next = {
        ...data,
        readings: data.readings.map(r => (r.articleId === rec.articleId ? { ...r, focusQuestion: rec.focusQuestion } : r))
      }
    }
    await save(next)
    openReader(rec.articleId)
  }

  function saveDiagField(field: DiagField, value: string) {
    return update(
      latest => {
        if (!latest.diagnosis) return latest
        const diagnosisNext: Diagnosis = {
          ...latest.diagnosis,
          restated: field === 'restated' ? value : latest.diagnosis.restated,
          mainContradiction: field === 'mainContradiction' ? value : latest.diagnosis.mainContradiction,
          stage: field === 'stage' ? value : latest.diagnosis.stage
        }
        return { ...latest, diagnosis: diagnosisNext }
      },
      { versionLabel: '第一步：手动修订诊断' }
    )
  }

  function discussWithCoach() {
    document.querySelector<HTMLTextAreaElement>('.chat-input')?.focus()
    window.dispatchEvent(new CustomEvent('chat-prefill', { detail: '我对诊断有不同看法：' }))
  }

  return (
    <div className="step-problem scroll">
      <p className="step-lead serif">
        拿出你最头疼的问题。没有问题，就不要翻开《毛选》。
      </p>

      <div className="step-problem-grid">
        <div className="field">
          <div className="field-label">1. 现在最头疼的一件事</div>
          <div className="field-hint">具体、真实、正在发生的。至少 10 个字。</div>
          <textarea
            className="textarea"
            rows={3}
            value={problem.text}
            placeholder="例：店铺连续三个月亏损，我不知道该关店还是继续撑。"
            onChange={e => editProblem('text', e.target.value)}
            onBlur={persistProblem}
          />
          {tooShort && <div className="error-text">没有问题，就不要翻开《毛选》——先把最头疼的一件事写具体</div>}
        </div>

        <div className="field">
          <div className="field-label">2. 背景</div>
          <div className="field-hint">这件事怎么发生的？涉及谁、多少钱、拖了多久？</div>
          <textarea
            className="textarea"
            rows={3}
            value={problem.background}
            placeholder="例：去年扩店借了 20 万，客流没起来，每月还要还 1.2 万。"
            onChange={e => editProblem('background', e.target.value)}
            onBlur={persistProblem}
          />
        </div>

        <div className="field">
          <div className="field-label">3. 已经试过什么办法</div>
          <div className="field-hint">试过什么、结果如何。这决定主要矛盾在哪。</div>
          <textarea
            className="textarea"
            rows={3}
            value={problem.tried}
            placeholder="例：投过两次广告、找朋友借过钱，都没解决客流问题。"
            onChange={e => editProblem('tried', e.target.value)}
            onBlur={persistProblem}
          />
        </div>
      </div>

      <div className="step-actions-bar">
        <button type="button" className="btn btn-primary" disabled={tooShort || busy} onClick={() => void diagnose()}>
          {busy && <span className="spinner" />} 请教练诊断
        </button>
        {changed && <span className="muted">问题已改动，建议重新诊断</span>}
        {err && <span className="error-text">{err}</span>}
      </div>

      {diagnosis && (
        <div className="card problem-diagnosis">
          <div className="sp1-diag-head">
            <div className="card-title sp1-diag-title">教练诊断</div>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={discussWithCoach}>
              和教练讨论分歧
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={openRevise}>
              套用讨论结果
            </button>
          </div>

          <DiagEdit label="复述你的问题" value={diagnosis.restated} onSave={v => saveDiagField('restated', v)} />

          {diagnosis.symptoms.length > 0 && (
            <div className="diag-block">
              <div className="diag-label">症状</div>
              <div className="diag-symptoms">
                {diagnosis.symptoms.map((s, i) => (
                  <span className="badge" key={`${i}-${s}`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DiagEdit
            label="主要矛盾"
            value={diagnosis.mainContradiction}
            strong
            onSave={v => saveDiagField('mainContradiction', v)}
          />

          <DiagEdit label="所处阶段" value={diagnosis.stage} onSave={v => saveDiagField('stage', v)} />

          <div className="diag-block">
            <div className="diag-label">推荐篇目（只读这几篇就够）</div>
            <div className="rec-list">
              {diagnosis.recommendations.map(rec => (
                <div className="rec-card" key={rec.articleId}>
                  <div className="rec-head">
                    <span className="rec-title serif">{rec.title}</span>
                    <span className="spacer" />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openRecommendation(rec)}>
                      去读原文
                    </button>
                  </div>
                  <p className="rec-reason">{rec.reason}</p>
                  <p className="rec-focus">带着这个问题读：{rec.focusQuestion}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="step-actions-bar">
        <button type="button" className="btn btn-primary" disabled={tooShort || !diagnosis || busy} onClick={() => void confirm()}>
          确认问题，进入第二步 →
        </button>
        <span className="muted">教练只指路，原文和笔记得你自己来。</span>
        {err && <span className="error-text">{err}</span>}
      </div>
    </div>
  )
}
