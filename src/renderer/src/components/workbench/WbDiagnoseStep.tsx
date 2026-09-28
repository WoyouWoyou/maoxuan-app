import { useState } from 'react'
import type {
  WbContradiction,
  WbDiagnosis,
  WbIntake,
  WbObjSubj,
  WbRouteKey,
  WbRoutes
} from '@shared/types'
import { WB_OBJSUBJ, WB_ROUTES, WB_SOURCES, wbStepUnlocked } from '@shared/workbench'
import type { WbSourceArea } from '@shared/workbench'
import type { WbStepProps } from './types'
import { toMessage } from './types'
import './wb.css'

type TabKey = 'contradiction' | 'routes' | 'objSubj'
type ScoreKey = 'trend' | 'resources' | 'constraints' | 'judgment' | 'execution'

const TABS: { key: TabKey; name: string; area: WbSourceArea }[] = [
  { key: 'contradiction', name: '抓主要矛盾', area: 'contradiction' },
  { key: 'routes', name: '三条路线', area: 'routes' },
  { key: 'objSubj', name: '主客分析', area: 'objSubj' }
]

const SCORE_GROUPS: { title: string; keys: ScoreKey[] }[] = [
  { title: '客观 3', keys: ['trend', 'resources', 'constraints'] },
  { title: '主观 2', keys: ['judgment', 'execution'] }
]

const ROUTE_FIELDS: { key: keyof RouteDraft; label: string; rows: number; lines: boolean }[] = [
  { key: 'judgment', label: '战略判断', rows: 2, lines: false },
  { key: 'policy', label: '方针', rows: 2, lines: false },
  { key: 'result', label: '可能结果', rows: 2, lines: false },
  { key: 'triggers', label: '触发条件（一行一条）', rows: 3, lines: true },
  { key: 'risks', label: '主要风险（一行一条）', rows: 3, lines: true },
  { key: 'switchSignals', label: '切换信号（一行一条）', rows: 3, lines: true }
]

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

function clampScore(raw: string): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return 1
  return Math.min(5, Math.max(1, n))
}

function scoreMeta(key: ScoreKey): { name: string; desc: string } {
  const item = WB_OBJSUBJ.find(f => f.key === key)
  return { name: item?.name ?? key, desc: item?.desc ?? '' }
}

function factTitle(intake: WbIntake | null, id: string): string {
  const fact = intake?.facts.find(f => f.id === id)
  return fact ? `${fact.id} ${fact.content}` : id
}

function PanelHead(props: {
  title: string
  edited: boolean
  busy: boolean
  onRegenerate: () => void
  onEdit: (() => void) | null
}) {
  const { title, edited, busy, onRegenerate, onEdit } = props
  return (
    <div className="wb-panel-head">
      <div className="wb-panel-title">{title}</div>
      {edited && <span className="badge">已手改</span>}
      <span className="spacer" />
      <button type="button" className="btn btn-sm" disabled={busy} onClick={onRegenerate}>
        {busy && <span className="spinner" />}重新生成
      </button>
      {onEdit && (
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onEdit}>
          编辑
        </button>
      )}
    </div>
  )
}

function PanelFoot(props: { factRefs: string[]; missingFacts: string[]; intake: WbIntake | null }) {
  const { factRefs, missingFacts, intake } = props
  return (
    <div className="wb-panel-foot">
      <div className="wb-sec-label">依据</div>
      <div className="wb-refs">
        {factRefs.length === 0 ? (
          <span className="muted wb-missing-note">没有引用事实</span>
        ) : (
          factRefs.map(id => (
            <span className="badge" key={id} title={factTitle(intake, id)}>
              {id}
            </span>
          ))
        )}
      </div>
      {missingFacts.length > 0 && (
        <div className="muted wb-missing-note">判断依赖补充事实：{missingFacts.join('；')}</div>
      )}
    </div>
  )
}

function EditArea(props: { label: string; rows: number; value: string; onChange: (v: string) => void }) {
  const { label, rows, value, onChange } = props
  return (
    <div className="field wb-edit-field">
      <div className="field-label">{label}</div>
      <textarea className="textarea" rows={rows} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function WbField(props: { label: string; value: string }) {
  const { label, value } = props
  return (
    <div className="wb-field">
      <div className="wb-field-label">{label}</div>
      <div className="wb-field-value">{value}</div>
    </div>
  )
}

function WbList(props: { label: string; items: string[]; prefix?: string }) {
  const { label, items, prefix } = props
  return (
    <div className="wb-field">
      <div className="wb-field-label">{label}</div>
      {items.length === 0 ? (
        <div className="muted wb-field-value">—</div>
      ) : (
        <ul className="wb-list">
          {items.map((item, i) => (
            <li key={`${i}-${item}`}>{prefix ? `${prefix} ${item}` : item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScoreRow(props: {
  name: string
  desc: string
  score: number
  reason: string
  disabled: boolean
  onPick: (n: number) => void
}) {
  const { name, desc, score, reason, disabled, onPick } = props
  return (
    <div className="wb-score-row">
      <div className="wb-score-name">
        <div className="wb-score-title">{name}</div>
        <div className="muted wb-score-desc">{desc}</div>
      </div>
      <div className="wb-dots">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            className={`wb-dot-score${n <= score ? ' is-on' : ''}`}
            disabled={disabled}
            title={`打 ${n} 分`}
            onClick={() => onPick(n)}
          />
        ))}
      </div>
      <div className="wb-score-reason">{reason}</div>
    </div>
  )
}

/* ------------------------------ 主要矛盾 ------------------------------ */

interface ContraDraft {
  all: string
  primary: string
  mainAspect: string
  secondaryAspect: string
  why: string
  turningConditions: string
  focus: string
  defer: string
}

function toContraDraft(m: WbContradiction): ContraDraft {
  return {
    all: m.all.join('\n'),
    primary: m.primary,
    mainAspect: m.mainAspect,
    secondaryAspect: m.secondaryAspect,
    why: m.why,
    turningConditions: m.turningConditions.join('\n'),
    focus: m.focus,
    defer: m.defer.join('\n')
  }
}

function fromContraDraft(d: ContraDraft) {
  return {
    all: splitLines(d.all),
    primary: d.primary.trim(),
    mainAspect: d.mainAspect.trim(),
    secondaryAspect: d.secondaryAspect.trim(),
    why: d.why.trim(),
    turningConditions: splitLines(d.turningConditions),
    focus: d.focus.trim(),
    defer: splitLines(d.defer)
  }
}

interface PanelProps<M> {
  module: M | null
  busy: boolean
  err: string
  intake: WbIntake | null
  onRegenerate: () => void
  onSave: (patch: Partial<WbDiagnosis>, versionLabel: string) => Promise<void>
}

function ContradictionPanel({ module, busy, err, intake, onRegenerate, onSave }: PanelProps<WbContradiction>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ContraDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  if (!module) {
    return (
      <div className="wb-panel">
        <PanelHead title="主要矛盾" edited={false} busy={busy} onRegenerate={onRegenerate} onEdit={null} />
        {err ? <div className="error-text">{err}</div> : <div className="empty">还没有诊断</div>}
      </div>
    )
  }

  const m = module

  async function commit(values: ContraDraft) {
    setSaving(true)
    setSaveErr('')
    try {
      await onSave({ contradiction: { ...m, ...fromContraDraft(values), edited: true } }, '第二步：修改主要矛盾')
      setEditing(false)
      setDraft(null)
    } catch (e) {
      setSaveErr(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const d = draft ?? toContraDraft(m)
    const set = (patch: Partial<ContraDraft>) => setDraft({ ...d, ...patch })
    return (
      <div className="wb-panel">
        <PanelHead title="主要矛盾" edited={m.edited} busy={busy} onRegenerate={onRegenerate} onEdit={null} />
        {err && <div className="error-text">{err}</div>}
        <div className="wb-edit">
          <EditArea label="全部矛盾（一行一条）" rows={4} value={d.all} onChange={v => set({ all: v })} />
          <EditArea label="主要矛盾" rows={2} value={d.primary} onChange={v => set({ primary: v })} />
          <div className="wb-edit-grid">
            <EditArea label="主要方面" rows={2} value={d.mainAspect} onChange={v => set({ mainAspect: v })} />
            <EditArea
              label="次要方面"
              rows={2}
              value={d.secondaryAspect}
              onChange={v => set({ secondaryAspect: v })}
            />
          </div>
          <EditArea label="为什么是当前主矛盾" rows={3} value={d.why} onChange={v => set({ why: v })} />
          <EditArea
            label="转化条件（一行一条）"
            rows={3}
            value={d.turningConditions}
            onChange={v => set({ turningConditions: v })}
          />
          <EditArea label="当前抓手" rows={2} value={d.focus} onChange={v => set({ focus: v })} />
          <EditArea label="暂时不碰（一行一条）" rows={3} value={d.defer} onChange={v => set({ defer: v })} />
          <div className="wb-edit-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => void commit(d)}
            >
              {saving && <span className="spinner" />}保存修改
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => {
                setEditing(false)
                setDraft(null)
                setSaveErr('')
              }}
            >
              取消
            </button>
            {saveErr && <span className="error-text">{saveErr}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="wb-panel">
      <PanelHead
        title="主要矛盾"
        edited={m.edited}
        busy={busy}
        onRegenerate={onRegenerate}
        onEdit={() => {
          setDraft(toContraDraft(m))
          setSaveErr('')
          setEditing(true)
        }}
      />
      {err && <div className="error-text">{err}</div>}

      <div className="wb-sec">
        <div className="wb-sec-label">全部矛盾</div>
        <ol className="wb-ordered">
          {m.all.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ol>
      </div>

      <div className="wb-primary">
        <div className="wb-sec-label">主要矛盾</div>
        <div className="wb-primary-text">{m.primary}</div>
      </div>

      <div className="wb-grid2">
        <div className="wb-sec">
          <div className="wb-sec-label">主要方面</div>
          <div className="wb-line">{m.mainAspect}</div>
        </div>
        <div className="wb-sec">
          <div className="wb-sec-label">次要方面</div>
          <div className="wb-line">{m.secondaryAspect}</div>
        </div>
      </div>

      <div className="wb-sec">
        <div className="wb-sec-label">为什么是当前主矛盾</div>
        <p className="wb-line">{m.why}</p>
      </div>

      <div className="wb-sec">
        <div className="wb-sec-label">转化条件</div>
        <ul className="wb-ordered">
          {m.turningConditions.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="wb-focus">
        <div className="wb-sec-label">当前抓手</div>
        <div className="wb-line">{m.focus}</div>
      </div>

      <div className="wb-sec">
        <div className="wb-sec-label">暂时不碰</div>
        {m.defer.length === 0 ? (
          <div className="muted wb-line">—</div>
        ) : (
          <ul className="wb-defer">
            {m.defer.map((item, i) => (
              <li key={`${i}-${item}`}>⏸ {item}</li>
            ))}
          </ul>
        )}
      </div>

      <PanelFoot factRefs={m.factRefs} missingFacts={m.missingFacts} intake={intake} />
    </div>
  )
}

/* ------------------------------ 三条路线 ------------------------------ */

interface RouteDraft {
  judgment: string
  policy: string
  result: string
  triggers: string
  risks: string
  switchSignals: string
}

function toRouteDrafts(m: WbRoutes): RouteDraft[] {
  return WB_ROUTES.map(meta => {
    const route = m.routes.find(r => r.key === meta.key)
    return {
      judgment: route?.judgment ?? '',
      policy: route?.policy ?? '',
      result: route?.result ?? '',
      triggers: (route?.triggers ?? []).join('\n'),
      risks: (route?.risks ?? []).join('\n'),
      switchSignals: (route?.switchSignals ?? []).join('\n')
    }
  })
}

function fromRouteDrafts(drafts: RouteDraft[]) {
  return WB_ROUTES.map<{ key: WbRouteKey; judgment: string; policy: string; result: string; triggers: string[]; risks: string[]; switchSignals: string[] }>(
    (meta, i) => {
      const d = drafts[i]
      return {
        key: meta.key as WbRouteKey,
        judgment: d.judgment.trim(),
        policy: d.policy.trim(),
        result: d.result.trim(),
        triggers: splitLines(d.triggers),
        risks: splitLines(d.risks),
        switchSignals: splitLines(d.switchSignals)
      }
    }
  )
}

function RoutesPanel({ module, busy, err, intake, onRegenerate, onSave }: PanelProps<WbRoutes>) {
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<RouteDraft[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  if (!module) {
    return (
      <div className="wb-panel">
        <PanelHead title="三条路线" edited={false} busy={busy} onRegenerate={onRegenerate} onEdit={null} />
        {err ? <div className="error-text">{err}</div> : <div className="empty">还没有诊断</div>}
      </div>
    )
  }

  const m = module

  function setDraftAt(index: number, key: keyof RouteDraft, value: string) {
    setDrafts(prev => (prev ? prev.map((d, i) => (i === index ? { ...d, [key]: value } : d)) : prev))
  }

  async function commit(values: RouteDraft[]) {
    setSaving(true)
    setSaveErr('')
    try {
      await onSave({ routes: { ...m, routes: fromRouteDrafts(values), edited: true } }, '第二步：修改三条路线')
      setEditing(false)
      setDrafts(null)
    } catch (e) {
      setSaveErr(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const list = drafts ?? toRouteDrafts(m)
    return (
      <div className="wb-panel">
        <PanelHead title="三条路线" edited={m.edited} busy={busy} onRegenerate={onRegenerate} onEdit={null} />
        {err && <div className="error-text">{err}</div>}
        <div className="wb-edit">
          <div className="wb-grid3">
            {WB_ROUTES.map((meta, i) => (
              <div className="card wb-route" key={meta.key}>
                <div className="wb-route-name">{meta.name}</div>
                <div className="muted wb-route-desc">{meta.desc}</div>
                {ROUTE_FIELDS.map(field => (
                  <EditArea
                    key={field.key}
                    label={field.label}
                    rows={field.rows}
                    value={list[i][field.key]}
                    onChange={v => setDraftAt(i, field.key, v)}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="wb-edit-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => void commit(list)}
            >
              {saving && <span className="spinner" />}保存修改
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => {
                setEditing(false)
                setDrafts(null)
                setSaveErr('')
              }}
            >
              取消
            </button>
            {saveErr && <span className="error-text">{saveErr}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="wb-panel">
      <PanelHead
        title="三条路线"
        edited={m.edited}
        busy={busy}
        onRegenerate={onRegenerate}
        onEdit={() => {
          setDrafts(toRouteDrafts(m))
          setSaveErr('')
          setEditing(true)
        }}
      />
      {err && <div className="error-text">{err}</div>}

      <div className="wb-grid3">
        {WB_ROUTES.map(meta => {
          const route = m.routes.find(r => r.key === meta.key)
          return (
            <div className="card wb-route" key={meta.key}>
              <div className="wb-route-name">{meta.name}</div>
              <div className="muted wb-route-desc">{meta.desc}</div>
              {route ? (
                <>
                  <WbField label="战略判断" value={route.judgment} />
                  <WbField label="方针" value={route.policy} />
                  <WbField label="可能结果" value={route.result} />
                  <WbList label="触发条件" items={route.triggers} />
                  <WbList label="主要风险" items={route.risks} />
                  <WbList label="切换信号" items={route.switchSignals} prefix="⇄" />
                </>
              ) : (
                <div className="muted">这一路缺失</div>
              )}
            </div>
          )
        })}
      </div>

      <PanelFoot factRefs={m.factRefs} missingFacts={m.missingFacts} intake={intake} />
    </div>
  )
}

/* ------------------------------ 主客分析 ------------------------------ */

interface ScoreDraft {
  score: string
  reason: string
}

interface ObjSubjDraft {
  scores: Record<ScoreKey, ScoreDraft>
  ready: string
  biggestGap: string
  firstFix: string
  ifNotFixed: string
}

function toObjSubjDraft(m: WbObjSubj): ObjSubjDraft {
  return {
    scores: {
      trend: { score: String(m.trend.score), reason: m.trend.reason },
      resources: { score: String(m.resources.score), reason: m.resources.reason },
      constraints: { score: String(m.constraints.score), reason: m.constraints.reason },
      judgment: { score: String(m.judgment.score), reason: m.judgment.reason },
      execution: { score: String(m.execution.score), reason: m.execution.reason }
    },
    ready: m.ready,
    biggestGap: m.biggestGap,
    firstFix: m.firstFix,
    ifNotFixed: m.ifNotFixed
  }
}

function fromObjSubjDraft(m: WbObjSubj, d: ObjSubjDraft): WbObjSubj {
  return {
    ...m,
    edited: true,
    trend: { score: clampScore(d.scores.trend.score), reason: d.scores.trend.reason.trim() },
    resources: { score: clampScore(d.scores.resources.score), reason: d.scores.resources.reason.trim() },
    constraints: { score: clampScore(d.scores.constraints.score), reason: d.scores.constraints.reason.trim() },
    judgment: { score: clampScore(d.scores.judgment.score), reason: d.scores.judgment.reason.trim() },
    execution: { score: clampScore(d.scores.execution.score), reason: d.scores.execution.reason.trim() },
    ready: d.ready.trim(),
    biggestGap: d.biggestGap.trim(),
    firstFix: d.firstFix.trim(),
    ifNotFixed: d.ifNotFixed.trim()
  }
}

function ObjSubjPanel({ module, busy, err, intake, onRegenerate, onSave }: PanelProps<WbObjSubj>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ObjSubjDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  if (!module) {
    return (
      <div className="wb-panel">
        <PanelHead title="主客分析" edited={false} busy={busy} onRegenerate={onRegenerate} onEdit={null} />
        {err ? <div className="error-text">{err}</div> : <div className="empty">还没有诊断</div>}
      </div>
    )
  }

  const m = module

  function pickScore(key: ScoreKey, n: number) {
    const next: WbObjSubj = {
      ...m,
      edited: true,
      trend: key === 'trend' ? { ...m.trend, score: n } : m.trend,
      resources: key === 'resources' ? { ...m.resources, score: n } : m.resources,
      constraints: key === 'constraints' ? { ...m.constraints, score: n } : m.constraints,
      judgment: key === 'judgment' ? { ...m.judgment, score: n } : m.judgment,
      execution: key === 'execution' ? { ...m.execution, score: n } : m.execution
    }
    setSaveErr('')
    void onSave({ objSubj: next }, '第二步：修改主客分析').catch(e => setSaveErr(toMessage(e)))
  }

  async function commit(values: ObjSubjDraft) {
    setSaving(true)
    setSaveErr('')
    try {
      await onSave({ objSubj: fromObjSubjDraft(m, values) }, '第二步：修改主客分析')
      setEditing(false)
      setDraft(null)
    } catch (e) {
      setSaveErr(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const d = draft ?? toObjSubjDraft(m)
    const setScore = (key: ScoreKey, patch: Partial<ScoreDraft>) =>
      setDraft({ ...d, scores: { ...d.scores, [key]: { ...d.scores[key], ...patch } } })
    return (
      <div className="wb-panel">
        <PanelHead title="主客分析" edited={m.edited} busy={busy} onRegenerate={onRegenerate} onEdit={null} />
        {err && <div className="error-text">{err}</div>}
        <div className="wb-edit">
          {SCORE_GROUPS.map(group => (
            <div className="wb-group" key={group.title}>
              <div className="wb-group-title">{group.title}</div>
              {group.keys.map(key => {
                const meta = scoreMeta(key)
                return (
                  <div className="field wb-edit-field" key={key}>
                    <div className="field-label">
                      {meta.name}｜{meta.desc}（1–5 分）
                    </div>
                    <div className="wb-score-line">
                      <input
                        className="input wb-score-input"
                        type="number"
                        min={1}
                        max={5}
                        value={d.scores[key].score}
                        onChange={e => setScore(key, { score: e.target.value })}
                      />
                      <textarea
                        className="textarea"
                        rows={2}
                        value={d.scores[key].reason}
                        onChange={e => setScore(key, { reason: e.target.value })}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <EditArea label="当前具备的条件" rows={2} value={d.ready} onChange={v => setDraft({ ...d, ready: v })} />
          <EditArea
            label="最大缺口"
            rows={2}
            value={d.biggestGap}
            onChange={v => setDraft({ ...d, biggestGap: v })}
          />
          <EditArea label="先补哪一项" rows={2} value={d.firstFix} onChange={v => setDraft({ ...d, firstFix: v })} />
          <EditArea
            label="如果不补会发生什么"
            rows={2}
            value={d.ifNotFixed}
            onChange={v => setDraft({ ...d, ifNotFixed: v })}
          />
          <div className="wb-edit-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => void commit(d)}
            >
              {saving && <span className="spinner" />}保存修改
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => {
                setEditing(false)
                setDraft(null)
                setSaveErr('')
              }}
            >
              取消
            </button>
            {saveErr && <span className="error-text">{saveErr}</span>}
          </div>
        </div>
      </div>
    )
  }

  const total = m.trend.score + m.resources.score + m.constraints.score + m.judgment.score + m.execution.score

  return (
    <div className="wb-panel">
      <PanelHead
        title="主客分析"
        edited={m.edited}
        busy={busy}
        onRegenerate={onRegenerate}
        onEdit={() => {
          setDraft(toObjSubjDraft(m))
          setSaveErr('')
          setEditing(true)
        }}
      />
      {err && <div className="error-text">{err}</div>}

      <div className="wb-total">
        成事条件 <b>{total}</b> / 25
      </div>

      {SCORE_GROUPS.map(group => (
        <div className="wb-group" key={group.title}>
          <div className="wb-group-title">{group.title}</div>
          {group.keys.map(key => {
            const meta = scoreMeta(key)
            return (
              <ScoreRow
                key={key}
                name={meta.name}
                desc={meta.desc}
                score={m[key].score}
                reason={m[key].reason}
                disabled={false}
                onPick={n => pickScore(key, n)}
              />
            )
          })}
        </div>
      ))}

      <div className="wb-grid2">
        <div className="wb-box">
          <div className="wb-sec-label">当前具备的条件</div>
          <div className="wb-line">{m.ready}</div>
        </div>
        <div className="wb-box is-gap">
          <div className="wb-sec-label">最大缺口</div>
          <div className="wb-line">{m.biggestGap}</div>
        </div>
        <div className="wb-box is-fix">
          <div className="wb-sec-label">先补哪一项</div>
          <div className="wb-line">{m.firstFix}</div>
        </div>
        <div className="wb-box">
          <div className="wb-sec-label">如果不补会发生什么</div>
          <div className="wb-line">{m.ifNotFixed}</div>
        </div>
      </div>

      {saveErr && <div className="error-text">{saveErr}</div>}
      <PanelFoot factRefs={m.factRefs} missingFacts={m.missingFacts} intake={intake} />
    </div>
  )
}

/* ------------------------------ 第二步外壳 ------------------------------ */

export function WbDiagnoseStep({ session, wb, updateWb, goStep, openSource }: WbStepProps) {
  const [tab, setTab] = useState<TabKey>('contradiction')
  const [busy, setBusy] = useState<Record<TabKey, boolean>>({
    contradiction: false,
    routes: false,
    objSubj: false
  })
  const [errs, setErrs] = useState<Record<TabKey, string>>({
    contradiction: '',
    routes: '',
    objSubj: ''
  })

  const diagnosis = wb.diagnosis
  const intake = wb.intake
  const gate = wbStepUnlocked(wb, 'wb_decide')
  const current = TABS.find(t => t.key === tab) ?? TABS[0]
  const source = WB_SOURCES.find(s => s.area === current.area)

  const allDone = Boolean(diagnosis.contradiction && diagnosis.routes && diagnosis.objSubj)
  const anyBusy = busy.contradiction || busy.routes || busy.objSubj

  function setLoading(key: TabKey, value: boolean) {
    setBusy(prev => ({ ...prev, [key]: value }))
  }

  function setErr(key: TabKey, message: string) {
    setErrs(prev => ({ ...prev, [key]: message }))
  }

  function patchDiagnosis(patch: Partial<WbDiagnosis>, versionLabel: string) {
    return updateWb(l => ({ ...l, diagnosis: { ...l.diagnosis, ...patch } }), { versionLabel })
  }

  async function runContradiction() {
    setLoading('contradiction', true)
    setErr('contradiction', '')
    try {
      const res = await window.api.wb.contradiction(session.id)
      await patchDiagnosis({ contradiction: res }, '第二步：主要矛盾')
    } catch (e) {
      setErr('contradiction', toMessage(e))
    } finally {
      setLoading('contradiction', false)
    }
  }

  async function runRoutes() {
    setLoading('routes', true)
    setErr('routes', '')
    try {
      const res = await window.api.wb.routes(session.id)
      await patchDiagnosis({ routes: res }, '第二步：三条路线')
    } catch (e) {
      setErr('routes', toMessage(e))
    } finally {
      setLoading('routes', false)
    }
  }

  async function runObjSubj() {
    setLoading('objSubj', true)
    setErr('objSubj', '')
    try {
      const res = await window.api.wb.objSubj(session.id)
      await patchDiagnosis({ objSubj: res }, '第二步：主客分析')
    } catch (e) {
      setErr('objSubj', toMessage(e))
    } finally {
      setLoading('objSubj', false)
    }
  }

  async function runAll() {
    await Promise.allSettled([runContradiction(), runRoutes(), runObjSubj()])
  }

  return (
    <div className="wb-step">
      <div className="wb-source">
        {source && (
          <div className="wb-source-quote">
            {source.quote} ——《{source.title}》
          </div>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSource(current.area)}>
          看原文依据 →
        </button>
      </div>

      <div className="wb-bar">
        <button type="button" className="btn btn-primary" disabled={anyBusy} onClick={() => void runAll()}>
          {anyBusy && <span className="spinner" />} {allDone ? '全部重新诊断' : '一键三路诊断'}
        </button>
        <span className="muted wb-bar-note">三个分析员各干各的：只看事实台账，互不参考</span>
      </div>

      <div className="wb-tabs">
        {TABS.map(item => {
          const done = Boolean(diagnosis[item.key])
          const loading = busy[item.key]
          return (
            <button
              key={item.key}
              type="button"
              className={`wb-tab${tab === item.key ? ' is-on' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {loading && <span className="spinner" />}
              {item.name}
              {done && !loading ? ' ✓' : ''}
            </button>
          )
        })}
      </div>

      {tab === 'contradiction' && (
        <ContradictionPanel
          module={diagnosis.contradiction}
          busy={busy.contradiction}
          err={errs.contradiction}
          intake={intake}
          onRegenerate={() => void runContradiction()}
          onSave={patchDiagnosis}
        />
      )}

      {tab === 'routes' && (
        <RoutesPanel
          module={diagnosis.routes}
          busy={busy.routes}
          err={errs.routes}
          intake={intake}
          onRegenerate={() => void runRoutes()}
          onSave={patchDiagnosis}
        />
      )}

      {tab === 'objSubj' && (
        <ObjSubjPanel
          module={diagnosis.objSubj}
          busy={busy.objSubj}
          err={errs.objSubj}
          intake={intake}
          onRegenerate={() => void runObjSubj()}
          onSave={patchDiagnosis}
        />
      )}

      <div className="wb-bar">
        <button type="button" className="btn btn-primary" disabled={!gate.ok} onClick={() => goStep('wb_decide')}>
          进入综合决策 →
        </button>
        {!gate.ok && <span className="muted">{gate.reason}</span>}
      </div>
    </div>
  )
}
