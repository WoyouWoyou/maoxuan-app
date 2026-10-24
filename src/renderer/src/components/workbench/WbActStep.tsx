import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  ActionProgress,
  ActionStatus,
  WbAction,
  WbHorizon,
  WbLedgerType,
  WbRecapInput,
  WbRecapResult
} from '@shared/types'
import type { WorkbenchCommand } from '@shared/contracts/workbench'
import {
  WB_HORIZONS,
  WB_STANDARD_NAMES,
  WB_STANDARDS,
  mergeWaived,
  ruleChecksActions,
  routeName
} from '@shared/workbench'
import { useActionSelection } from '@renderer/features/workbench-actions/useActionSelection'
import {
  UNSAVED_EDIT_NOTICE,
  actionDraftDirty
} from '@renderer/features/workbench-actions/pendingEdit'
import { ActionProgressLog } from '../ActionProgressLog'
import { WbActionCandidateCard } from './WbActionCandidateCard'
import { WbActionSelectionBar } from './WbActionSelectionBar'
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

const CONFLICT_MESSAGE = '内容已在其他窗口更新，已刷新；请重新核对选择后再提交'

type BatchOutcome = { tone: 'ok' | 'warn'; text: string }

/** 一次提交的完整意图：同一个 mutationId + 同一组命令，重试时原样复用。 */
interface BatchIntent {
  commands: WorkbenchCommand[]
  mutationId: string
  count: number
  clearOnSuccess: boolean
}

interface FailedBatch extends BatchIntent {
  message: string
}

interface BatchNoticeProps {
  failure: FailedBatch | null
  outcome: BatchOutcome | null
  busy: boolean
  onRetry: () => void
  onCancelRetry: () => void
  actionLink?: { label: string; onClick: () => void }
}

function BatchNotice({
  failure,
  outcome,
  busy,
  onRetry,
  onCancelRetry,
  actionLink
}: BatchNoticeProps) {
  if (failure) {
    return (
      <div className="wbx-warn" role="alert">
        <span className="error-text">{failure.message}</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onRetry}>
          重试
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={onCancelRetry}
        >
          取消重试
        </button>
      </div>
    )
  }
  if (!outcome) return null
  return (
    <div className={outcome.tone === 'ok' ? 'wbx-feedback' : 'wbx-feedback is-warn'} role="status">
      <span>{outcome.text}</span>
      {actionLink && outcome.tone === 'ok' ? (
        <button type="button" className="btn btn-sm btn-ghost" onClick={actionLink.onClick}>
          {actionLink.label}
        </button>
      ) : null}
    </div>
  )
}

interface StandardOption {
  value: string
  label: string
  hint: string
}

const STD_META = metaList(WB_STANDARDS)

function standardLabel(value: string): string {
  const found = STD_META.find((s) => s.key === value || s.name === value)
  return found && found.name ? found.name : value
}

function standardHint(value: string): string {
  const found = STD_META.find((s) => s.key === value || s.name === value)
  return found?.hint ?? ''
}

const STANDARD_OPTIONS: StandardOption[] = (() => {
  const named = metaList(WB_STANDARD_NAMES).map((m) => ({
    value: m.key,
    label: m.name || m.key,
    hint: standardHint(m.key) || m.hint
  }))
  if (named.length > 0) return named
  return STD_META.map((m) => ({ value: m.key, label: m.name || m.key, hint: m.hint }))
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
  return '待办'
}

function statusClass(status: ActionStatus): string {
  if (status === 'done') return 'badge badge-ok'
  if (status === 'dropped') return 'badge'
  return 'badge badge-red'
}

/** 移回候选的前置条件；空字符串表示可以移回。 */
function returnBlockedReason(action: WbAction): string {
  if (action.status === 'done') return '已完成，不能移回候选'
  if (action.status === 'dropped') return '已放弃，不能移回候选'
  if ((action.progress?.length ?? 0) > 0) return '已有阶段记录，不能移回候选'
  return ''
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

export function WbActStep({
  session,
  wb,
  updateWb,
  applyWorkbench,
  reloadSession,
  goStep,
  openSource
}: WbStepProps) {
  const navigate = useNavigate()
  const decision = wb.decision
  const [busy, setBusy] = useState<'gen' | 'save' | 'recap' | 'enqueue' | 'return' | null>(null)
  const [err, setErr] = useState('')
  const [addingTo, setAddingTo] = useState<WbHorizon | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ActionDraft>(blankDraft('7d'))
  const [recapInput, setRecapInput] = useState<WbRecapInput>({
    progress: '',
    factChanges: '',
    judgmentsToFix: ''
  })
  const [recapResult, setRecapResult] = useState<WbRecapResult | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [factsAdded, setFactsAdded] = useState(false)
  const [enqueueFailure, setEnqueueFailure] = useState<FailedBatch | null>(null)
  const [enqueueOutcome, setEnqueueOutcome] = useState<BatchOutcome | null>(null)
  const [returnFailure, setReturnFailure] = useState<FailedBatch | null>(null)
  const [returnOutcome, setReturnOutcome] = useState<BatchOutcome | null>(null)
  const [historyHintDismissed, setHistoryHintDismissed] = useState(false)

  const candidates = wb.actions.filter((a) => a.planningState === 'candidate')
  const queued = wb.actions.filter((a) => a.planningState === 'queued')
  const selectableCandidateIds = candidates.filter((a) => a.status === 'todo').map((a) => a.id)
  const returnableIds = queued
    .filter((a) => a.status === 'todo' && (a.progress?.length ?? 0) === 0)
    .map((a) => a.id)

  // 候选与已加入待办各自独立，互不影响；复盘用的 picked 仍是单独的新事实勾选。
  const candidateSelection = useActionSelection(session.id, selectableCandidateIds)
  const queuedSelection = useActionSelection(session.id, returnableIds)

  // 批量提交只带行动 ID，不带文本。编辑未保存时提交会把旧文本纳入待办，
  // 所以批量加入 / 移回在提交前统一拦住，工具栏同时给出原因（不能只禁用 checkbox：
  // 已勾选的条目仍在选择集合里）。
  const editedAction = editingId ? (wb.actions.find((a) => a.id === editingId) ?? null) : null
  const unsavedEditReason =
    editedAction && actionDraftDirty(draft, editedAction) ? UNSAVED_EDIT_NOTICE : ''
  const enqueueBlockedReason = candidateSelection.count > 0 ? unsavedEditReason : ''
  const returnBatchBlockedReason = queuedSelection.count > 0 ? unsavedEditReason : ''

  const actionChecks = [
    ...mergeWaived(wb.actionChecks, ruleChecksActions(wb)),
    ...wb.actionChecks.filter((c) => c.source === 'ai')
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
      await updateWb((l) => ({ ...l }))
      const res = await window.api.wb.actions(session.id)
      await updateWb(
        (l) => ({
          ...l,
          actions: [...l.actions, ...res.actions],
          actionChecks: mergeWaived(l.actionChecks, res.checks)
        }),
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
      status === 'done'
        ? '第四步：完成行动'
        : status === 'dropped'
          ? '第四步：放弃行动'
          : '第四步：恢复行动'
    await updateWb(
      (l) => ({ ...l, actions: l.actions.map((x) => (x.id === a.id ? { ...x, status } : x)) }),
      { versionLabel: label }
    )
  }

  function toggleStandard(value: string, label: string) {
    setDraft((d) => {
      const has = d.standards.some((s) => s === value || s === label)
      if (has) return { ...d, standards: d.standards.filter((s) => s !== value && s !== label) }
      return { ...d, standards: [...d.standards, value] }
    })
  }

  function isStandardActive(list: string[], option: StandardOption): boolean {
    return list.some((s) => s === option.value || s === option.label)
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
        (l) => ({
          ...l,
          actions: l.actions.map((a) =>
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
      planningState: 'candidate',
      status: 'todo',
      progress: [],
      createdAt: new Date().toISOString()
    }
    setBusy('save')
    setErr('')
    try {
      await updateWb((l) => ({ ...l, actions: [...l.actions, item] }), {
        versionLabel: '第四步：添加行动'
      })
      setAddingTo(null)
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function addProgress(actionId: string, text: string) {
    const entry: ActionProgress = {
      id: crypto.randomUUID(),
      text: text.trim(),
      createdAt: new Date().toISOString()
    }
    await updateWb(
      (l) => ({
        ...l,
        actions: l.actions.map((a) =>
          a.id === actionId ? { ...a, progress: [...(a.progress ?? []), entry] } : a
        )
      }),
      { versionLabel: '第四步：阶段记录' }
    )
  }

  async function editProgress(actionId: string, progressId: string, text: string) {
    await updateWb((l) => ({
      ...l,
      actions: l.actions.map((a) =>
        a.id === actionId
          ? {
              ...a,
              progress: (a.progress ?? []).map((p) =>
                p.id === progressId ? { ...p, text: text.trim() } : p
              )
            }
          : a
      )
    }))
  }

  async function removeProgress(actionId: string, progressId: string) {
    await updateWb((l) => ({
      ...l,
      actions: l.actions.map((a) =>
        a.id === actionId
          ? { ...a, progress: (a.progress ?? []).filter((p) => p.id !== progressId) }
          : a
      )
    }))
  }

  async function waiveActionCheck(id: string) {
    const target = actionChecks.find((c) => c.id === id)
    if (!target) return
    await updateWb((l) => {
      const exists = l.actionChecks.some((c) => c.id === id)
      return {
        ...l,
        actionChecks: exists
          ? l.actionChecks.map((c) => (c.id === id ? { ...c, waived: true } : c))
          : [...l.actionChecks, { ...target, waived: true }]
      }
    })
  }

  /**
   * 一次提交 = 一次 applyWorkbench = 一次事务 + 一份版本快照。
   * 失败时保留 intent，重试沿用同一个 mutationId 和命令，绝不重新构造请求。
   */
  async function submitBatch(kind: 'enqueue' | 'return', intent: BatchIntent) {
    setBusy(kind)
    setErr('')
    const versionLabel = kind === 'enqueue' ? '第四步：加入待办' : '第四步：移回候选'
    try {
      await applyWorkbench(intent.commands, { versionLabel, mutationId: intent.mutationId })
      if (kind === 'enqueue') {
        if (intent.clearOnSuccess) candidateSelection.clear()
        setEnqueueFailure(null)
        setEnqueueOutcome({ tone: 'ok', text: `已加入 ${intent.count} 条` })
      } else {
        if (intent.clearOnSuccess) queuedSelection.clear()
        setReturnFailure(null)
        setReturnOutcome({ tone: 'ok', text: `已移回 ${intent.count} 条` })
      }
    } catch (e) {
      const message = toMessage(e)
      const conflict = message.includes('其他窗口更新')
      if (kind === 'enqueue') {
        if (conflict) {
          setEnqueueFailure(null)
          setEnqueueOutcome({ tone: 'warn', text: CONFLICT_MESSAGE })
          await reloadSession()
        } else {
          setEnqueueOutcome(null)
          setEnqueueFailure({ ...intent, message })
        }
      } else if (conflict) {
        setReturnFailure(null)
        setReturnOutcome({ tone: 'warn', text: CONFLICT_MESSAGE })
        await reloadSession()
      } else {
        setReturnOutcome(null)
        setReturnFailure({ ...intent, message })
      }
    } finally {
      setBusy(null)
    }
  }

  function doEnqueue() {
    if (busy !== null) return
    // 提交函数内再保护一次：按钮禁用可能被绕过，旧文本不能被静默纳入待办。
    if (unsavedEditReason) {
      setEnqueueFailure(null)
      setEnqueueOutcome({ tone: 'warn', text: unsavedEditReason })
      return
    }
    const ids = [...candidateSelection.selectedIds]
    if (ids.length === 0) return
    const intent: BatchIntent = {
      commands: [{ kind: 'enqueueActions', ids }],
      mutationId: crypto.randomUUID(),
      count: ids.length,
      clearOnSuccess: true
    }
    setEnqueueFailure(null)
    setEnqueueOutcome(null)
    void submitBatch('enqueue', intent)
  }

  function retryEnqueue() {
    if (busy !== null || !enqueueFailure) return
    if (unsavedEditReason) {
      setEnqueueFailure(null)
      setEnqueueOutcome({ tone: 'warn', text: unsavedEditReason })
      return
    }
    const { commands, mutationId, count, clearOnSuccess } = enqueueFailure
    setEnqueueFailure(null)
    void submitBatch('enqueue', { commands, mutationId, count, clearOnSuccess })
  }

  function doReturn(ids: string[], clearOnSuccess: boolean) {
    if (busy !== null || ids.length === 0) return
    if (unsavedEditReason) {
      setReturnFailure(null)
      setReturnOutcome({ tone: 'warn', text: unsavedEditReason })
      return
    }
    const intent: BatchIntent = {
      commands: [{ kind: 'returnActionsToCandidates', ids: [...ids] }],
      mutationId: crypto.randomUUID(),
      count: ids.length,
      clearOnSuccess
    }
    setReturnFailure(null)
    setReturnOutcome(null)
    void submitBatch('return', intent)
  }

  function retryReturn() {
    if (busy !== null || !returnFailure) return
    if (unsavedEditReason) {
      setReturnFailure(null)
      setReturnOutcome({ tone: 'warn', text: unsavedEditReason })
      return
    }
    const { commands, mutationId, count, clearOnSuccess } = returnFailure
    setReturnFailure(null)
    void submitBatch('return', { commands, mutationId, count, clearOnSuccess })
  }

  async function doRecap() {
    if (!recapInput.progress.trim()) {
      setErr('先写一句最新进展')
      return
    }
    setBusy('recap')
    setErr('')
    try {
      await updateWb((l) => ({ ...l }))
      const res = await window.api.wb.recap(session.id, {
        progress: recapInput.progress.trim(),
        factChanges: recapInput.factChanges.trim(),
        judgmentsToFix: recapInput.judgmentsToFix.trim()
      })
      await updateWb((l) => ({ ...l, ledger: [...l.ledger, res.entry] }), {
        versionLabel: '第四步：复盘'
      })
      setRecapResult(res)
      setPicked(Object.fromEntries(res.newFacts.map((f) => [f.id, true])))
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
    const chosen = facts.filter((f) => picked[f.id] !== false)
    if (chosen.length === 0) return
    await guard(async () => {
      await updateWb(
        (l) =>
          l.intake ? { ...l, intake: { ...l.intake, facts: [...l.intake.facts, ...chosen] } } : l,
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
            onChange={(e) => {
              const v = e.target.value
              setDraft((d) => ({ ...d, action: v }))
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
              onChange={(e) => {
                const v = e.target.value
                setDraft((d) => ({ ...d, purpose: v }))
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
              onChange={(e) => {
                const v = e.target.value
                setDraft((d) => ({ ...d, verify: v }))
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">与 KPI 的关系</span>
            <textarea
              className="textarea"
              rows={2}
              value={draft.kpi}
              onChange={(e) => {
                const v = e.target.value
                setDraft((d) => ({ ...d, kpi: v }))
              }}
            />
          </label>
        </div>

        <div className="field">
          <span className="field-label">时间跨度</span>
          <div className="wbx-route-chips">
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                type="button"
                title={h.hint}
                className={draft.horizon === h.key ? 'wbx-route-chip active' : 'wbx-route-chip'}
                onClick={() => {
                  const key = h.key
                  setDraft((d) => ({ ...d, horizon: key }))
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
            {STANDARD_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.hint}
                className={
                  isStandardActive(draft.standards, o) ? 'wbx-std-chip active' : 'wbx-std-chip'
                }
                onClick={() => toggleStandard(o.value, o.label)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="wbx-form-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving && <span className="spinner" />} 保存
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={saving}
            onClick={onCancel}
          >
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
        <div className="card-title">候选策略</div>
        <div className="wbx-actions-bar">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy !== null}
            onClick={() => void genActions()}
          >
            {busy === 'gen' && <span className="spinner" />}{' '}
            {wb.actions.length === 0 ? '生成 7 / 30 / 90 天候选策略' : '补充候选策略'}
          </button>
          <span className="wbx-section-sub">先筛选本轮要做的事，勾选后加入待办。</span>
        </div>

        <div className="wbx-lanes">
          {HORIZONS.map((h) => {
            const laneActions = candidates.filter((a) => a.horizon === h.key)
            const laneSelectableIds = laneActions
              .filter((a) => a.status === 'todo')
              .map((a) => a.id)
            return (
              <div className="wbx-lane" key={h.key}>
                <div className="wbx-lane-head">
                  <div className="wbx-lane-title">
                    <div className="wbx-lane-name">{h.name}</div>
                    <div className="wbx-lane-hint muted">{h.hint}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`选择本组：${h.name}`}
                    disabled={laneSelectableIds.length === 0 || busy !== null}
                    onClick={() => candidateSelection.selectMany(laneSelectableIds)}
                  >
                    选择本组
                  </button>
                </div>
                <div className="wbx-lane-body">
                  {laneActions.length === 0 && addingTo !== h.key && (
                    <div className="muted wbx-lane-empty">还没有候选策略</div>
                  )}

                  {laneActions.map((a) => (
                    <WbActionCandidateCard
                      key={a.id}
                      action={a}
                      checked={candidateSelection.isSelected(a.id)}
                      disabled={busy !== null || a.status !== 'todo'}
                      editing={editingId === a.id}
                      onCheck={(next) => {
                        if (next === candidateSelection.isSelected(a.id)) return
                        candidateSelection.toggle(a.id)
                      }}
                      onEdit={() => startEdit(a)}
                      form={
                        editingId === a.id
                          ? renderForm(saveEdit, () => setEditingId(null))
                          : undefined
                      }
                    />
                  ))}

                  {addingTo === h.key && (
                    <div className="wbx-action">{renderForm(saveNew, () => setAddingTo(null))}</div>
                  )}

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

        <WbActionSelectionBar
          count={candidateSelection.count}
          busy={busy !== null}
          actionLabel="加入待办"
          blockedReason={enqueueBlockedReason}
          onAction={doEnqueue}
          onClear={candidateSelection.clear}
          notice={
            enqueueFailure || enqueueOutcome ? (
              <BatchNotice
                failure={enqueueFailure}
                outcome={enqueueOutcome}
                busy={busy !== null}
                onRetry={retryEnqueue}
                onCancelRetry={() => setEnqueueFailure(null)}
                actionLink={{ label: '查看工作清单', onClick: () => navigate('/actions') }}
              />
            ) : undefined
          }
        />
      </section>

      <section className="card wbx-queued">
        <div className="card-title">已加入待办</div>
        <div className="wbx-section-sub">
          移回后会保留目的、验证、象限和日期；再次加入时继续沿用。
        </div>

        {returnableIds.length > 0 && !historyHintDismissed && (
          <div className="wbx-hint wbx-history-hint">
            <span>历史行动已保留：还没开始的可以移回候选。</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setHistoryHintDismissed(true)}
            >
              知道了
            </button>
          </div>
        )}

        <div className="wbx-lanes">
          {queued.length === 0 ? (
            <div className="muted wbx-lane-empty">还没有加入待办</div>
          ) : (
            HORIZONS.map((h) => {
              const laneActions = queued.filter((a) => a.horizon === h.key)
              return (
                <div className="wbx-lane" key={h.key}>
                  <div className="wbx-lane-head">
                    <div className="wbx-lane-title">
                      <div className="wbx-lane-name">{h.name}</div>
                      <div className="wbx-lane-hint muted">{h.hint}</div>
                    </div>
                  </div>
                  <div className="wbx-lane-body">
                    {laneActions.length === 0 && (
                      <div className="muted wbx-lane-empty">还没有加入待办</div>
                    )}

                    {laneActions.map((a) => {
                      const blocked = returnBlockedReason(a)
                      if (editingId === a.id) {
                        return (
                          <div className="wbx-action" key={a.id}>
                            {renderForm(saveEdit, () => setEditingId(null))}
                          </div>
                        )
                      }
                      return (
                        <div
                          className={
                            a.status === 'done'
                              ? 'wbx-action is-done'
                              : a.status === 'dropped'
                                ? 'wbx-action is-dropped'
                                : 'wbx-action'
                          }
                          key={a.id}
                        >
                          <div className="wbx-action-head">
                            <label
                              className="wbx-action-check"
                              title={blocked || '选择后可批量移回候选'}
                            >
                              <input
                                type="checkbox"
                                checked={queuedSelection.isSelected(a.id)}
                                disabled={Boolean(blocked) || busy !== null}
                                aria-label={`选择已加入待办：${a.action}`}
                                onChange={() => queuedSelection.toggle(a.id)}
                              />
                            </label>
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
                              {a.standards.map((s) => (
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
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              disabled={Boolean(blocked) || busy !== null}
                              aria-label={`移回候选：${a.action}`}
                              title={
                                blocked ||
                                '移回后会保留目的、验证、象限和日期；再次加入时继续沿用。'
                              }
                              onClick={() => doReturn([a.id], false)}
                            >
                              移回候选
                            </button>
                          </div>

                          <ActionProgressLog
                            progress={a.progress ?? []}
                            disabled={a.status === 'dropped'}
                            onAdd={(text) => addProgress(a.id, text)}
                            onEdit={(id, text) => editProgress(a.id, id, text)}
                            onRemove={(id) => removeProgress(a.id, id)}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <WbActionSelectionBar
          count={queuedSelection.count}
          busy={busy !== null}
          actionLabel="移回候选"
          blockedReason={returnBatchBlockedReason}
          onAction={() => doReturn([...queuedSelection.selectedIds], true)}
          onClear={queuedSelection.clear}
          notice={
            returnFailure || returnOutcome ? (
              <BatchNotice
                failure={returnFailure}
                outcome={returnOutcome}
                busy={busy !== null}
                onRetry={retryReturn}
                onCancelRetry={() => setReturnFailure(null)}
              />
            ) : undefined
          }
        />
      </section>

      <div className="wbx-checks-block">
        <ChecksPanel
          title="行动自检"
          checks={actionChecks}
          busy={busy !== null}
          onWaive={(id) => void guard(() => waiveActionCheck(id))}
        />
      </div>

      <section className="card wbx-recap">
        <div className="card-title">复盘纠偏</div>
        <div className="muted wbx-recap-sub">
          做了一段时间？把新情况带回来：实践、认识、再实践、再认识
        </div>

        <label className="field">
          <span className="field-label">最新进展</span>
          <textarea
            className="textarea"
            rows={3}
            value={recapInput.progress}
            placeholder="这一段时间实际发生了什么"
            onChange={(e) => {
              const v = e.target.value
              setRecapInput((r) => ({ ...r, progress: v }))
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
            onChange={(e) => {
              const v = e.target.value
              setRecapInput((r) => ({ ...r, factChanges: v }))
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
            onChange={(e) => {
              const v = e.target.value
              setRecapInput((r) => ({ ...r, judgmentsToFix: v }))
            }}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy !== null}
          onClick={() => void doRecap()}
        >
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
                {recapResult.newFacts.map((f) => (
                  <label className="wbx-fact" key={f.id}>
                    <input
                      type="checkbox"
                      checked={picked[f.id] !== false}
                      onChange={(e) => {
                        const on = e.target.checked
                        setPicked((p) => ({ ...p, [f.id]: on }))
                      }}
                    />
                    <span className="badge">{f.id}</span>
                    <span>{f.content}</span>
                  </label>
                ))}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={factsAdded}
                  onClick={() => void addFacts()}
                >
                  {factsAdded ? '已加入' : '加入事实台账'}
                </button>
              </div>
            )}

            {recapResult.rediagnose && (
              <div className="wbx-warn">
                <span>新事实可能改变主要矛盾或路线：{recapResult.rediagnoseReason}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => goStep('wb_diagnose')}
                >
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
            {[...wb.ledger].reverse().map((e) => (
              <details className="wbx-ledger-item" key={e.id}>
                <summary className="wbx-ledger-head">
                  <span className="wbx-ledger-time muted">{formatTime(e.createdAt)}</span>
                  <span className={e.inputType === 'revision' ? 'badge badge-red' : 'badge'}>
                    {LEDGER_LABEL[e.inputType]}
                  </span>
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
