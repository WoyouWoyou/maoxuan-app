import { useEffect, useMemo, useState } from 'react'
import type { Diagnosis, ProblemInput, ProblemRevision, Session } from '@shared/types'
import './ReviseDialog.css'
import { readingPresentation, analysisOf } from '@shared/reading-presentation'

type FieldKey =
  | 'text'
  | 'background'
  | 'tried'
  | 'restated'
  | 'symptoms'
  | 'mainContradiction'
  | 'stage'
  | 'recommendations'

interface FieldRow {
  key: FieldKey
  label: string
  oldText: string
  newText: string
  changed: boolean
}

export interface ReviseDialogProps {
  session: Session
  onClose: () => void
  onApply: (next: { problem: ProblemInput; diagnosis: Diagnosis }) => Promise<void>
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function display(text: string): string {
  return text.trim() ? text : '（空）'
}

function recText(list: Diagnosis['recommendations']): string {
  return list.map((r) => `《${r.title}》：${r.reason}`).join('\n')
}

function buildRows(
  problem: ProblemInput,
  diagnosis: Diagnosis | null,
  revision: ProblemRevision,
  generic = false
): FieldRow[] {
  const rows: Omit<FieldRow, 'changed'>[] = [
    { key: 'text', label: '问题', oldText: problem.text, newText: revision.problem.text },
    {
      key: 'background',
      label: '背景',
      oldText: problem.background,
      newText: revision.problem.background
    },
    { key: 'tried', label: '已经试过', oldText: problem.tried, newText: revision.problem.tried },
    {
      key: 'restated',
      label: '复述',
      oldText: diagnosis?.restated ?? '',
      newText: revision.diagnosis.restated
    },
    {
      key: 'symptoms',
      label: '症状',
      oldText: diagnosis ? diagnosis.symptoms.join('；') : '',
      newText: revision.diagnosis.symptoms.join('；')
    },
    {
      key: 'mainContradiction',
      label: generic ? '当前关键障碍' : '主要矛盾',
      oldText: analysisOf(diagnosis).obstacle,
      newText: analysisOf(revision.diagnosis).obstacle
    },
    {
      key: 'stage',
      label: generic ? '约束与待确认信息' : '所处阶段',
      oldText: analysisOf(diagnosis).constraints,
      newText: analysisOf(revision.diagnosis).constraints
    },
    {
      key: 'recommendations',
      label: '推荐篇目',
      oldText: diagnosis ? recText(diagnosis.recommendations) : '',
      newText: recText(revision.diagnosis.recommendations)
    }
  ]
  return rows.map((r) => ({ ...r, changed: r.oldText.trim() !== r.newText.trim() }))
}

export function ReviseDialog({ session, onClose, onApply }: ReviseDialogProps) {
  const sessionId = session.id
  const currentProblem = session.data.problem
  const currentDiagnosis = session.data.diagnosis

  const [revision, setRevision] = useState<ProblemRevision | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [applyError, setApplyError] = useState('')
  const [checked, setChecked] = useState<Set<FieldKey>>(new Set())
  const [applying, setApplying] = useState(false)
  const [openUnchanged, setOpenUnchanged] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError('')
    setRevision(null)
    setChecked(new Set())
    void (async () => {
      try {
        const rev = await window.api.ai.reviseProblem(sessionId)
        if (!alive) return
        const rows = buildRows(
          currentProblem,
          currentDiagnosis,
          rev,
          readingPresentation(session.data).generic
        )
        setRevision(rev)
        setChecked(new Set(rows.filter((r) => r.changed).map((r) => r.key)))
        setLoading(false)
      } catch (e) {
        if (!alive) return
        setLoadError(toMessage(e))
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // 仅在打开对话 / 重试时重新请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reloadKey])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows = useMemo(
    () =>
      revision
        ? buildRows(
            currentProblem,
            currentDiagnosis,
            revision,
            readingPresentation(session.data).generic
          )
        : [],
    [revision, currentProblem, currentDiagnosis]
  )
  const changedRows = rows.filter((r) => r.changed)
  const unchangedRows = rows.filter((r) => !r.changed)

  function toggle(key: FieldKey) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function apply() {
    if (!revision || applying || checked.size === 0) return
    setApplyError('')
    setApplying(true)
    try {
      const baseProblem: ProblemInput = { ...currentProblem }
      const baseDiagnosis: Diagnosis = currentDiagnosis ?? revision.diagnosis

      const nextProblem: ProblemInput = {
        text: checked.has('text') ? revision.problem.text : baseProblem.text,
        background: checked.has('background')
          ? revision.problem.background
          : baseProblem.background,
        tried: checked.has('tried') ? revision.problem.tried : baseProblem.tried
      }
      const nextDiagnosis: Diagnosis = {
        _context: revision.diagnosis._context,
        ...(session.data.book?.profile === 'generic'
          ? {
              analysis: {
                obstacle: checked.has('mainContradiction')
                  ? analysisOf(revision.diagnosis).obstacle
                  : analysisOf(baseDiagnosis).obstacle,
                constraints: checked.has('stage')
                  ? analysisOf(revision.diagnosis).constraints
                  : analysisOf(baseDiagnosis).constraints
              }
            }
          : {}),
        restated: checked.has('restated') ? revision.diagnosis.restated : baseDiagnosis.restated,
        symptoms: checked.has('symptoms')
          ? [...revision.diagnosis.symptoms]
          : [...baseDiagnosis.symptoms],
        mainContradiction: checked.has('mainContradiction')
          ? revision.diagnosis.mainContradiction
          : baseDiagnosis.mainContradiction,
        stage: checked.has('stage') ? revision.diagnosis.stage : baseDiagnosis.stage,
        recommendations: checked.has('recommendations')
          ? revision.diagnosis.recommendations.map((r) => ({ ...r }))
          : baseDiagnosis.recommendations.map((r) => ({ ...r }))
      }
      await onApply({ problem: nextProblem, diagnosis: nextDiagnosis })
    } catch (e) {
      setApplyError(toMessage(e))
    } finally {
      setApplying(false)
    }
  }

  function renderRow(row: FieldRow, selectable: boolean) {
    const on = selectable && checked.has(row.key)
    const body = (
      <>
        {selectable ? (
          <input
            type="checkbox"
            className="rev-check"
            checked={on}
            onChange={() => toggle(row.key)}
          />
        ) : (
          <span className="rev-check rev-check-off" />
        )}
        <div className="rev-row-body">
          <div className="rev-row-label">{row.label}</div>
          <div className="rev-diff">
            <div className="rev-cell">
              <div className="rev-cell-label">原来</div>
              <div className="rev-text muted">{display(row.oldText)}</div>
            </div>
            <div className="rev-cell rev-cell-new">
              <div className="rev-cell-label">修订后</div>
              <div className="rev-text">{display(row.newText)}</div>
            </div>
          </div>
        </div>
      </>
    )
    return selectable ? (
      <label key={row.key} className={on ? 'rev-row is-on' : 'rev-row'}>
        {body}
      </label>
    ) : (
      <div key={row.key} className="rev-row is-off">
        {body}
      </div>
    )
  }

  return (
    <div className="rev-mask" onClick={onClose}>
      <div className="rev-card" onClick={(e) => e.stopPropagation()}>
        <header className="rev-head">
          <span className="rev-title">套用讨论结果</span>
          <span className="rev-sub muted">只套用你勾选的字段</span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={applying}
          >
            关闭
          </button>
        </header>

        <div className="rev-body scroll">
          {loading && (
            <div className="empty">
              <span className="spinner" /> 教练正在整理你们的讨论…
            </div>
          )}

          {!loading && loadError && (
            <div className="rev-error">
              <span className="error-text">{loadError}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                重试
              </button>
            </div>
          )}

          {!loading && revision && (
            <>
              <div className="rev-changes">
                <div className="rev-section-title">讨论要点</div>
                {revision.changes.length === 0 ? (
                  <p className="muted rev-no-change">讨论里没有需要改动的地方</p>
                ) : (
                  <ul className="rev-change-list">
                    {revision.changes.map((c, i) => (
                      <li key={`${i}-${c}`}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rev-section-title">逐字段对比</div>
              {changedRows.length === 0 && (
                <p className="muted rev-no-change">所有字段都与当前一致</p>
              )}
              {changedRows.map((row) => renderRow(row, true))}

              {unchangedRows.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm rev-unchanged-toggle"
                    onClick={() => setOpenUnchanged((v) => !v)}
                  >
                    未改动的字段（{unchangedRows.length}）{openUnchanged ? '收起' : '展开'}
                  </button>
                  {openUnchanged && unchangedRows.map((row) => renderRow(row, false))}
                </>
              )}
            </>
          )}
        </div>

        <footer className="rev-foot">
          <span className="rev-count muted">已选 {checked.size} 项</span>
          <span className="spacer" />
          {applyError && <span className="error-text">{applyError}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={applying}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={applying || checked.size === 0}
            onClick={() => void apply()}
          >
            {applying && <span className="spinner" />} 套用选中项
          </button>
        </footer>
      </div>
    </div>
  )
}
