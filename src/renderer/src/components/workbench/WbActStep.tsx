import { useState } from 'react'
import type {
  ActionProgress,
  ActionStatus,
  WbAction,
  WbHorizon,
  WbLedgerType,
  WbRecapInput,
  WbRecapResult
} from '@shared/types'
import { WB_HORIZONS, WB_STANDARD_NAMES, WB_STANDARDS, mergeWaived, ruleChecksActions, routeName } from '@shared/workbench'
import { ActionProgressLog } from '../ActionProgressLog'
import { ChecksPanel, metaList } from './WbDecideStep'
import type { WbStepProps } from './types'
import { toMessage } from './types'
import './wb34.css'

interface HorizonItem {
  key: WbHorizon
  name: string
  hint: string
}

const HORIZONS: HorizonItem[] = WB_HORIZONS

interface StandardOption {
  value: string
  label: string
  hint: string
}

const STD_META = metaList(WB_STANDARDS)

function standardLabel(value: string): string {
  const found = STD_META.find(s => s.key === value || s.name === value)
  return found && found.name ? found.name : value
}

function standardHint(value: string): string {
  const found = STD_META.find(s => s.key === value || s.name === value)
  return found?.hint ?? ''
}

const STANDARD_OPTIONS: StandardOption[] = (() => {
  const named = metaList(WB_STANDARD_NAMES).map(m => ({
    value: m.key,
    label: m.name || m.key,
    hint: standardHint(m.key) || m.hint
  }))
  if (named.length > 0) return named
  return STD_META.map(m => ({ value: m.key, label: m.name || m.key, hint: m.hint }))
})()

const LEDGER_LABEL: Record<WbLedgerType, string> = {
  new: '新建',
  update: '更新',
  revision: '修订',
  feedback: '反馈'
}

interface ActionDraft {
  action: string
  purpose: string
  verify: string
  kpi: string
  horizon: WbHorizon
  standards: string[]
}

function blankDraft(horizon: WbHorizon): ActionDraft {
  return { action: '', purpose: '', verify: '', kpi: '', horizon, standards: [] }
}

function statusLabel(status: ActionStatus): string {
  if (status === 'done') return '已完成'
  if (status === 'dropped') return '已放弃'
  return '进行中'
}

function statusClass(status: ActionStatus): string {
  if (status === 'done') return 'badge badge-ok'
  if (status === 'dropped') return 'badge'
  return 'badge badge-red'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function MiniField({ label, text }: { label: string; text: string }) {
  return (
    <div className="wbx-field">
      <div className="wbx-field-label">{label}</div>
      <div className="wbx-field-text">{text || '—'}</div>
    </div>
  )
}

function DeltaList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="wbx-delta">
      <div className="wbx-delta-title">{title}</div>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

export function WbActStep({ session, wb, updateWb, goStep, openSource }: WbStepProps) {
  const decision = wb.decision
  const [busy, setBusy] = useState<'gen' | 'save' | 'recap' | null>(null)
  const [err, setErr] = useState('')
  const [addingTo, setAddingTo] = useState<WbHorizon | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ActionDraft>(blankDraft('7d'))
  const [recapInput, setRecapInput] = useState<WbRecapInput>({ progress: '', factChanges: '', judgmentsToFix: '' })
  const [recapResult, setRecapResult] = useState<WbRecapResult | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [factsAdded, setFactsAdded] = useState(false)

  const actionChecks = [
    ...mergeWaived(wb.actionChecks, ruleChecksActions(wb.actions)),
    ...wb.actionChecks.filter(c => c.source === 'ai')
  ]

  async function guard(fn: () => Promise<void>) {
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(toMessage(e))
    }
  }

  async function genActions() {
    setBusy('gen')
    setErr('')
    try {
      await updateWb(l => ({ ...l }))
      const res = await window.api.wb.actions(session.id)
      await updateWb(
        l => ({ ...l, actions: [...l.actions, ...res.actions], actionChecks: mergeWaived(l.actionChecks, res.checks) }),
        { versionLabel: '第四步：生成行动' }
      )
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(a: WbAction, status: ActionStatus) {
    const label =
      status === 'done' ? '第四步：完成行动' : status === 'dropped' ? '第四步：放弃行动' : '第四步：恢复行动'
    await updateWb(
      l => ({ ...l, actions: l.actions.map(x => (x.id === a.id ? { ...x, status } : x)) }),
      { versionLabel: label }
    )
  }

  function toggleStandard(value: string, label: string) {
    setDraft(d => {
      const has = d.standards.some(s => s === value || s === label)
      if (has) return { ...d, standards: d.standards.filter(s => s !== value && s !== label) }
      return { ...d, standards: [...d.standards, value] }
    })
  }

  function isStandardActive(list: string[], option: StandardOption): boolean {
    return list.some(s => s === option.value || s === option.label)
  }

  function startAdd(horizon: WbHorizon) {
    setDraft(blankDraft(horizon))
    setEditingId(null)
    setAddingTo(horizon)
  }

  function startEdit(a: WbAction) {
    setDraft({
      action: a.action,
      purpose: a.purpose,
      verify: a.verify,
      kpi: a.kpi,
      horizon: a.horizon,
      standards: [...(a.standards ?? [])]
    })
    setAddingTo(null)
    setEditingId(a.id)
  }

  async function saveEdit() {
    const id = editingId
    if (!id) return
    const text = draft.action.trim()
    if (!text) {
      setErr('先把要做的事写清楚')
      return
    }
    setBusy('save')
    setErr('')
    try {
      await updateWb(
        l => ({
          ...l,
          actions: l.actions.map(a =>
            a.id === id
              ? {
                  ...a,
                  action: text,
                  purpose: draft.purpose.trim(),
                  verify: draft.verify.trim(),
                  kpi: draft.kpi.trim(),
                  horizon: draft.horizon,
                  standards: draft.standards
                }
              : a
          )
        }),
        { versionLabel: '第四步：修改行动' }
      )
      setEditingId(null)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function saveNew() {
    const text = draft.action.trim()
    if (!text) {
      setErr('先把要做的事写清楚')
      return
    }
    const item: WbAction = {
      id: crypto.randomUUID(),
      horizon: draft.horizon,
      action: text,
      purpose: draft.purpose.trim(),
      verify: draft.verify.trim(),
      standards: draft.standards,
      kpi: draft.kpi.trim(),
      status: 'todo',
      progress: [],
      createdAt: new Date().toISOString()
    }
    setBusy('save')
    setErr('')
    try {
      await updateWb(l => ({ ...l, actions: [...l.actions, item] }), { versionLabel: '第四步：添加行动' })
      setAddingTo(null)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function addProgress(actionId: string, text: string) {
    const entry: ActionProgress = { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() }
    await updateWb(
      l => ({
        ...l,
        actions: l.actions.map(a => (a.id === actionId ? { ...a, progress: [...(a.progress ?? []), entry] } : a))
      }),
      { versionLabel: '第四步：阶段记录' }
    )
  }

  async function editProgress(actionId: string, progressId: string, text: string) {
    await updateWb(l => ({
      ...l,
      actions: l.actions.map(a =>
        a.id === actionId
          ? { ...a, progress: (a.progress ?? []).map(p => (p.id === progressId ? { ...p, text: text.trim() } : p)) }
          : a
      )
    }))
  }

  async function removeProgress(actionId: string, progressId: string) {
    await updateWb(l => ({
      ...l,
      actions: l.actions.map(a =>
        a.id === actionId ? { ...a, progress: (a.progress ?? []).filter(p => p.id !== progressId) } : a
      )
    }))
  }

  async function waiveActionCheck(id: string) {
    const target = actionChecks.find(c => c.id === id)
    if (!target) return
    await updateWb(l => {
      const exists = l.actionChecks.some(c => c.id === id)
      return {
        ...l,
        actionChecks: exists
          ? l.actionChecks.map(c => (c.id === id ? { ...c, waived: true } : c))
          : [...l.actionChecks, { ...target, waived: true }]
      }
    })
  }

  async function doRecap() {
    if (!recapInput.progress.trim()) {
      setErr('先写一句最新进展')
      return
    }
    setBusy('recap')
    setErr('')
    try {
      await updateWb(l => ({ ...l }))
      const res = await window.api.wb.recap(session.id, {
        progress: recapInput.progress.trim(),
        factChanges: recapInput.factChanges.trim(),
        judgmentsToFix: recapInput.judgmentsToFix.trim()
      })
      await updateWb(l => ({ ...l, ledger: [...l.ledger, res.entry] }), { versionLabel: '第四步：复盘' })
      setRecapResult(res)
      setPicked(Object.fromEntries(res.newFacts.map(f => [f.id, true])))
      setFactsAdded(false)
      setRecapInput({ progress: '', factChanges: '', judgmentsToFix: '' })
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function addFacts() {
    const facts = recapResult?.newFacts ?? []
    const chosen = facts.filter(f => picked[f.id] !== false)
    if (chosen.length === 0) return
    await guard(async () => {
      await updateWb(
        l => (l.intake ? { ...l, intake: { ...l.intake, facts: [...l.intake.facts, ...chosen] } } : l),
        { versionLabel: '第四步：新事实入台账' }
      )
      setFactsAdded(true)
    })
  }

  function renderForm(onSave: () => Promise<void>, onCancel: () => void) {
    const saving = busy !== null
    return (
      <div className="wbx-form">
        <label className="field">
          <span className="field-label">动作</span>
          <textarea
            className="textarea"
            rows={2}
            value={draft.action}
            placeholder="一件具体能做的事，比如：跑 10 个目标客户问价"
            onChange={e => {
              const v = e.target.value
              setDraft(d => ({ ...d, action: v }))
            }}
          />
        </label>
        <div className="wbx-form-grid">
          <label className="field">
            <span className="field-label">目的</span>
            <textarea
              className="textarea"
              rows={2}
              value={draft.purpose}
              onChange={e => {
                const v = e.target.value
                setDraft(d => ({ ...d, purpose: v }))
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">验证</span>
            <textarea
              className="textarea"
              rows={2}
              value={draft.verify}
              placeholder="做完怎么知道有没有用"
              onChange={e => {
                const v = e.target.value
                setDraft(d => ({ ...d, verify: v }))
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">与 KPI 的关系</span>
            <textarea
              className="textarea"
              rows={2}
              value={draft.kpi}
              onChange={e => {
                const v = e.target.value
                setDraft(d => ({ ...d, kpi: v }))
              }}
            />
          </label>
        </div>

        <div className="field">
          <span className="field-label">时间跨度</span>
          <div className="wbx-route-chips">
            {HORIZONS.map(h => (
              <button
                key={h.key}
                type="button"
                title={h.hint}
                className={draft.horizon === h.key ? 'wbx-route-chip active' : 'wbx-route-chip'}
                onClick={() => {
                  const key = h.key
                  setDraft(d => ({ ...d, horizon: key }))
                }}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">毛选执行标准</span>
          <div className="wbx-std-chips">
            {STANDARD_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                title={o.hint}
                className={isStandardActive(draft.standards, o) ? 'wbx-std-chip active' : 'wbx-std-chip'}
                onClick={() => toggleStandard(o.value, o.label)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="wbx-form-actions">
          <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={() => void onSave()}>
            {saving && <span className="spinner" />} 保存
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wbx-step">
      <div className="wbx-source">
        <span className="serif">实践、认识、再实践、再认识</span>
        <span className="muted">——《实践论》</span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => openSource('act')}>
          看原文依据 →
        </button>
      </div>

      {err && <div className="error-text wbx-err">{err}</div>}

      <section className="card">
        <div className="wbx-snap">
          <div className="wbx-snap-cell">
            <div className="wbx-snap-label">主要矛盾</div>
            <div className="wbx-snap-text">{decision?.primaryContradiction || '—'}</div>
          </div>
          <div className="wbx-snap-cell">
            <div className="wbx-snap-label">推荐路线</div>
            <div className="wbx-snap-text">{decision ? routeName(decision.route) : '—'}</div>
          </div>
          <div className="wbx-snap-cell">
            <div className="wbx-snap-label">先打哪一仗</div>
            <div className="wbx-snap-text">{decision?.firstBattle || '—'}</div>
          </div>
          <div className="wbx-snap-cell">
            <div className="wbx-snap-label">最大缺口</div>
            <div className="wbx-snap-text">{decision?.biggestGap || '—'}</div>
          </div>
        </div>
      </section>

      <section className="card wbx-actions">
        <div className="card-title">行动</div>
        <div className="wbx-actions-bar">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void genActions()}>
            {busy === 'gen' && <span className="spinner" />}{' '}
            {wb.actions.length === 0 ? '生成 7 / 30 / 90 天行动' : '再补几条行动'}
          </button>
          <span className="muted">拿到动作就去干，干完回来记一笔。</span>
        </div>

        <div className="wbx-lanes">
          {HORIZONS.map(h => {
            const laneActions = wb.actions.filter(a => a.horizon === h.key)
            return (
              <div className="wbx-lane" key={h.key}>
                <div className="wbx-lane-head">
                  <div className="wbx-lane-name">{h.name}</div>
                  <div className="wbx-lane-hint muted">{h.hint}</div>
                </div>
                <div className="wbx-lane-body">
                  {laneActions.length === 0 && addingTo !== h.key && <div className="muted wbx-lane-empty">还没有行动</div>}

                  {laneActions.map(a =>
                    editingId === a.id ? (
                      <div className="wbx-action" key={a.id}>
                        {renderForm(saveEdit, () => setEditingId(null))}
                      </div>
                    ) : (
                      <div
                        className={
                          a.status === 'done' ? 'wbx-action is-done' : a.status === 'dropped' ? 'wbx-action is-dropped' : 'wbx-action'
                        }
                        key={a.id}
                      >
                        <div className="wbx-action-head">
                          <span className="wbx-action-title">{a.action}</span>
                          <span className="spacer" />
                          <span className={statusClass(a.status)}>{statusLabel(a.status)}</span>
                        </div>

                        <div className="wbx-action-fields">
                          <MiniField label="目的" text={a.purpose} />
                          <MiniField label="验证" text={a.verify} />
                          <MiniField label="与 KPI 的关系" text={a.kpi} />
                        </div>

                        {(a.standards ?? []).length > 0 && (
                          <div className="wbx-std-chips">
                            {a.standards.map(s => (
                              <span className="wbx-std" key={s} title={standardHint(s)}>
                                {standardLabel(s)}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="wbx-action-btns">
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={a.status === 'done' || busy !== null}
                            onClick={() => void guard(() => setStatus(a, 'done'))}
                          >
                            完成
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={a.status === 'dropped' || busy !== null}
                            onClick={() => void guard(() => setStatus(a, 'dropped'))}
                          >
                            放弃
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={a.status === 'todo' || busy !== null}
                            onClick={() => void guard(() => setStatus(a, 'todo'))}
                          >
                            恢复
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={busy !== null}
                            onClick={() => startEdit(a)}
                          >
                            编辑
                          </button>
                        </div>

                        <ActionProgressLog
                          progress={a.progress ?? []}
                          disabled={a.status === 'dropped'}
                          onAdd={text => addProgress(a.id, text)}
                          onEdit={(id, text) => editProgress(a.id, id, text)}
                          onRemove={id => removeProgress(a.id, id)}
                        />
                      </div>
                    )
                  )}

                  {addingTo === h.key && <div className="wbx-action">{renderForm(saveNew, () => setAddingTo(null))}</div>}

                  {addingTo !== h.key && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost wbx-lane-add"
                      disabled={busy !== null}
                      onClick={() => startAdd(h.key)}
                    >
                      + 手动添加
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="wbx-checks-block">
          <ChecksPanel
            title="行动自检"
            checks={actionChecks}
            busy={busy !== null}
            onWaive={id => void guard(() => waiveActionCheck(id))}
          />
        </div>
      </section>

      <section className="card wbx-recap">
        <div className="card-title">复盘纠偏</div>
        <div className="muted wbx-recap-sub">做了一段时间？把新情况带回来：实践、认识、再实践、再认识</div>

        <label className="field">
          <span className="field-label">最新进展</span>
          <textarea
            className="textarea"
            rows={3}
            value={recapInput.progress}
            placeholder="这一段时间实际发生了什么"
            onChange={e => {
              const v = e.target.value
              setRecapInput(r => ({ ...r, progress: v }))
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">哪些客观事实发生了变化</span>
          <textarea
            className="textarea"
            rows={2}
            value={recapInput.factChanges}
            placeholder="数字、资源、约束、对手动向"
            onChange={e => {
              const v = e.target.value
              setRecapInput(r => ({ ...r, factChanges: v }))
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">哪些旧判断要修正</span>
          <textarea
            className="textarea"
            rows={2}
            value={recapInput.judgmentsToFix}
            placeholder="之前认定、现在站不住的判断"
            onChange={e => {
              const v = e.target.value
              setRecapInput(r => ({ ...r, judgmentsToFix: v }))
            }}
          />
        </label>

        <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void doRecap()}>
          {busy === 'recap' && <span className="spinner" />} 复盘并记入台账
        </button>

        {recapResult && (
          <div className="wbx-recap-result">
            <div className="wbx-recap-summary serif">{recapResult.entry.summary}</div>
            <div className="wbx-deltas">
              <DeltaList title="事实变化" items={recapResult.entry.factDelta} />
              <DeltaList title="判断变化" items={recapResult.entry.judgmentDelta} />
              <DeltaList title="行动变化" items={recapResult.entry.actionsDelta} />
              <DeltaList title="要修正的旧假设" items={recapResult.entry.oldAssumptionsToFix} />
            </div>

            {recapResult.newFacts.length > 0 && (
              <div className="wbx-facts">
                <div className="wbx-label">建议加入事实台账</div>
                {recapResult.newFacts.map(f => (
                  <label className="wbx-fact" key={f.id}>
                    <input
                      type="checkbox"
                      checked={picked[f.id] !== false}
                      onChange={e => {
                        const on = e.target.checked
                        setPicked(p => ({ ...p, [f.id]: on }))
                      }}
                    />
                    <span className="badge">{f.id}</span>
                    <span>{f.content}</span>
                  </label>
                ))}
                <button type="button" className="btn btn-sm btn-ghost" disabled={factsAdded} onClick={() => void addFacts()}>
                  {factsAdded ? '已加入' : '加入事实台账'}
                </button>
              </div>
            )}

            {recapResult.rediagnose && (
              <div className="wbx-warn">
                <span>新事实可能改变主要矛盾或路线：{recapResult.rediagnoseReason}</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => goStep('wb_diagnose')}>
                  回到第二步重新诊断
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card wbx-ledger">
        <div className="card-title">项目台账 · 只追加，不覆盖</div>
        {wb.ledger.length === 0 ? (
          <div className="muted">还没有台账记录</div>
        ) : (
          <div className="wbx-ledger-list">
            {[...wb.ledger].reverse().map(e => (
              <details className="wbx-ledger-item" key={e.id}>
                <summary className="wbx-ledger-head">
                  <span className="wbx-ledger-time muted">{formatTime(e.createdAt)}</span>
                  <span className={e.inputType === 'revision' ? 'badge badge-red' : 'badge'}>{LEDGER_LABEL[e.inputType]}</span>
                  <span className="wbx-ledger-summary">{e.summary}</span>
                </summary>
                <div className="wbx-ledger-body">
                  <div className="wbx-label">原始输入记录</div>
                  <pre className="wbx-raw serif">{e.rawInput}</pre>
                  <DeltaList title="事实变化" items={e.factDelta} />
                  <DeltaList title="判断变化" items={e.judgmentDelta} />
                  <DeltaList title="行动变化" items={e.actionsDelta} />
                  <DeltaList title="要修正的旧假设" items={e.oldAssumptionsToFix} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
