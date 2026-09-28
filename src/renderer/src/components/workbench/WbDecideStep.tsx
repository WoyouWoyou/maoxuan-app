import { useState } from 'react'
import type { WbCheck, WbRouteKey } from '@shared/types'
import { WB_ROUTES, blockingChecks, enhancementName, routeName } from '@shared/workbench'
import type { WbStepProps } from './types'
import { toMessage } from './types'
import './wb34.css'

/** 元数据表可能是字符串数组、对象数组或记录，统一成 { key, name, hint }。 */
export interface MetaItem {
  key: string
  name: string
  hint: string
}

export function metaList(raw: unknown): MetaItem[] {
  if (Array.isArray(raw)) {
    return raw
      .map(item => {
        if (typeof item === 'string') return { key: item, name: item, hint: '' }
        const o = (item ?? {}) as { key?: string; name?: string; hint?: string }
        return { key: o.key ?? o.name ?? '', name: o.name ?? o.key ?? '', hint: o.hint ?? '' }
      })
      .filter(m => m.key)
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, string | { name?: string; hint?: string }>).map(([key, value]) =>
      typeof value === 'string'
        ? { key, name: value, hint: '' }
        : { key, name: value?.name ?? key, hint: value?.hint ?? '' }
    )
  }
  return []
}

const ROUTE_ITEMS = metaList(WB_ROUTES)

type BusyKind = 'gen' | 'recheck' | 'fix' | 'save'

interface DecisionDraft {
  route: WbRouteKey
  routeReason: string
  primaryContradiction: string
  biggestGap: string
  firstBattle: string
  notNow: string
  toInvestigate: string
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
}

export interface ChecksPanelProps {
  title: string
  checks: WbCheck[]
  onWaive: (id: string) => void
  busy?: boolean
}

/** 检查结果面板：未通过项可逐条“已知晓，保留”，通过项收起。 */
export function ChecksPanel({ title, checks, onWaive, busy = false }: ChecksPanelProps) {
  const failed = checks.filter(c => !c.passed && !c.waived)
  const waived = checks.filter(c => !c.passed && c.waived)
  const passed = checks.filter(c => c.passed)

  return (
    <div className="wbx-checks">
      <div className="wbx-checks-head">
        <span className="wbx-checks-title">{title}</span>
        <span className="spacer" />
        <span className="muted wbx-checks-sum">
          未通过 {failed.length} · 已知晓 {waived.length} · 通过 {passed.length}
        </span>
      </div>

      {failed.length === 0 && waived.length === 0 && <div className="muted wbx-checks-ok">没有未通过项。</div>}

      {failed.map(c => (
        <div className="wbx-check-fail" key={c.id}>
          <span className={c.source === 'ai' ? 'badge badge-red' : 'badge'}>{c.source === 'rule' ? '硬规则' : '红队'}</span>
          <span className="wbx-check-msg">{c.message}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onWaive(c.id)}>
            已知晓，保留
          </button>
        </div>
      ))}

      {waived.length > 0 && (
        <ul className="wbx-check-waived">
          {waived.map(c => (
            <li key={c.id}>
              <span className="wbx-waived-tag">已知晓</span>
              <span className="wbx-check-msg">{c.message}</span>
            </li>
          ))}
        </ul>
      )}

      {passed.length > 0 && (
        <details className="wbx-check-passed">
          <summary>通过 {passed.length} 项</summary>
          <ul>
            {passed.map(c => (
              <li key={c.id}>✓ {c.message}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function EditField({
  label,
  value,
  rows = 2,
  onChange
}: {
  label: string
  value: string
  rows?: number
  onChange: (v: string) => void
}) {
  return (
    <label className="field wbx-edit-field">
      <span className="field-label">{label}</span>
      <textarea
        className="textarea"
        rows={rows}
        value={value}
        onChange={e => {
          onChange(e.target.value)
        }}
      />
    </label>
  )
}

export function WbDecideStep({ session, wb, updateWb, goStep, openSource }: WbStepProps) {
  const decision = wb.decision
  const [busy, setBusy] = useState<BusyKind | null>(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DecisionDraft | null>(null)
  const [stale, setStale] = useState(false)

  const blocking = decision ? blockingChecks(decision.checks) : []
  const otherRoutes = (wb.diagnosis.routes?.routes ?? []).filter(r => r.key !== decision?.route)
  const missing: string[] = []
  if (!wb.diagnosis.contradiction) missing.push('主要矛盾')
  if (!wb.diagnosis.routes) missing.push('三条路线')
  if (!wb.diagnosis.objSubj) missing.push('主客分析')

  async function run(kind: BusyKind, fn: () => Promise<void>) {
    setBusy(kind)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function flush() {
    await updateWb(l => ({ ...l }))
  }

  async function generate() {
    await run('gen', async () => {
      await flush()
      const res = await window.api.wb.decide(session.id)
      await updateWb(l => ({ ...l, decision: res }), { versionLabel: '第三步：综合决策' })
      setStale(false)
    })
  }

  async function recheck() {
    await run('recheck', async () => {
      await flush()
      const checks = await window.api.wb.recheck(session.id)
      await updateWb(l => (l.decision ? { ...l, decision: { ...l.decision, checks } } : l))
      setStale(false)
    })
  }

  async function fixByChecks() {
    await run('fix', async () => {
      const res = await window.api.wb.decide(session.id)
      await updateWb(l => ({ ...l, decision: res }), { versionLabel: '第三步：按检查意见修复' })
      setStale(false)
    })
  }

  async function waive(id: string) {
    await updateWb(l =>
      l.decision
        ? { ...l, decision: { ...l.decision, checks: l.decision.checks.map(c => (c.id === id ? { ...c, waived: true } : c)) } }
        : l
    )
  }

  async function confirmDecision() {
    await run('save', async () => {
      await updateWb(
        l => (l.decision ? { ...l, decision: { ...l.decision, confirmed: true } } : l),
        { versionLabel: '第三步：确认决策', step: 'wb_act' }
      )
      goStep('wb_act')
    })
  }

  async function unconfirm() {
    await run('save', async () => {
      await updateWb(l => (l.decision ? { ...l, decision: { ...l.decision, confirmed: false } } : l))
    })
  }

  function startEdit() {
    if (!decision) return
    setDraft({
      route: decision.route,
      routeReason: decision.routeReason,
      primaryContradiction: decision.primaryContradiction,
      biggestGap: decision.biggestGap,
      firstBattle: decision.firstBattle,
      notNow: decision.notNow.join('\n'),
      toInvestigate: decision.toInvestigate.join('\n')
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!draft) return
    const patch = {
      route: draft.route,
      routeReason: draft.routeReason.trim(),
      primaryContradiction: draft.primaryContradiction.trim(),
      biggestGap: draft.biggestGap.trim(),
      firstBattle: draft.firstBattle.trim(),
      notNow: splitLines(draft.notNow),
      toInvestigate: splitLines(draft.toInvestigate)
    }
    await run('save', async () => {
      await updateWb(
        l => (l.decision ? { ...l, decision: { ...l.decision, ...patch, edited: true, confirmed: false } } : l),
        { versionLabel: '第三步：修改决策' }
      )
      setEditing(false)
      setDraft(null)
      setStale(true)
    })
  }

  return (
    <div className="wbx-step">
      <div className="wbx-source">
        <span className="serif">战略退却，是劣势军队处在优势军队进攻面前</span>
        <span className="muted">——《中国革命战争的战略问题》</span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => openSource('routes')}>
          看原文依据 →
        </button>
      </div>

      {err && <div className="error-text wbx-err">{err}</div>}

      {!decision ? (
        <section className="card wbx-intro">
          <div className="card-title">综合决策</div>
          <p className="wbx-intro-text">
            把三路诊断合成一份决策：主要矛盾、推荐路线、最大缺口、先打哪一仗、哪些事暂时不碰。生成后会自动跑硬规则 +
            红队检查，未通过项要先修。
          </p>
          {missing.length > 0 && <div className="muted wbx-note">三路诊断还缺：{missing.join('、')}。先回第二步补齐，结论才靠得住。</div>}
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void generate()}>
            {busy === 'gen' && <span className="spinner" />} 生成综合决策
          </button>
        </section>
      ) : (
        <section className="card wbx-decision">
          <div className="wbx-dec-head">
            <span className="wbx-dec-kicker serif">决策快照</span>
            {decision.edited && <span className="badge">已手改</span>}
            <span className="spacer" />
            {!editing && (
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={startEdit}>
                编辑
              </button>
            )}
          </div>

          {editing && draft ? (
            <div className="wbx-edit">
              <div className="field">
                <span className="field-label">推荐主路线</span>
                <div className="wbx-route-chips">
                  {ROUTE_ITEMS.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      title={item.hint}
                      className={draft.route === item.key ? 'wbx-route-chip active' : 'wbx-route-chip'}
                      onClick={() => {
                        const key = item.key as WbRouteKey
                        setDraft(d => (d ? { ...d, route: key } : d))
                      }}
                    >
                      {item.name || routeName(item.key as WbRouteKey)}
                    </button>
                  ))}
                </div>
              </div>

              <EditField
                label="主要矛盾"
                value={draft.primaryContradiction}
                rows={3}
                onChange={v => setDraft(d => (d ? { ...d, primaryContradiction: v } : d))}
              />
              <EditField
                label="推荐路线理由"
                value={draft.routeReason}
                onChange={v => setDraft(d => (d ? { ...d, routeReason: v } : d))}
              />
              <div className="wbx-edit-grid">
                <EditField
                  label="最大缺口"
                  value={draft.biggestGap}
                  onChange={v => setDraft(d => (d ? { ...d, biggestGap: v } : d))}
                />
                <EditField
                  label="先打哪一仗"
                  value={draft.firstBattle}
                  onChange={v => setDraft(d => (d ? { ...d, firstBattle: v } : d))}
                />
                <EditField
                  label="暂时不碰（一行一条）"
                  value={draft.notNow}
                  rows={4}
                  onChange={v => setDraft(d => (d ? { ...d, notNow: v } : d))}
                />
                <EditField
                  label="继续调查（一行一条）"
                  value={draft.toInvestigate}
                  rows={4}
                  onChange={v => setDraft(d => (d ? { ...d, toInvestigate: v } : d))}
                />
              </div>

              <div className="wbx-edit-actions">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void saveEdit()}>
                  {busy === 'save' && <span className="spinner" />} 保存修改
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy !== null}
                  onClick={() => {
                    setEditing(false)
                    setDraft(null)
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="wbx-contra">
                <div className="wbx-label">主要矛盾</div>
                <div className="wbx-contra-text serif">{decision.primaryContradiction || '（未填写）'}</div>
              </div>

              <div className="wbx-route">
                <div className="wbx-label">推荐主路线</div>
                <div className="wbx-route-row">
                  <span className="wbx-route-badge">{routeName(decision.route)}</span>
                  <span className="wbx-route-reason">{decision.routeReason || '（未填写理由）'}</span>
                </div>
                {otherRoutes.length > 0 && (
                  <div className="wbx-route-alt">
                    {otherRoutes.map(r => (
                      <div key={r.key}>
                        什么时候换线：{routeName(r.key)} —— {r.switchSignals[0] ?? '（未给出换线信号）'}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="wbx-grid2">
                <div className="wbx-block wbx-gap">
                  <div className="wbx-label">最大缺口</div>
                  <div className="wbx-block-text">{decision.biggestGap || '（未填写）'}</div>
                </div>
                <div className="wbx-block wbx-first">
                  <div className="wbx-label">先打哪一仗</div>
                  <div className="wbx-block-text wbx-strong">{decision.firstBattle || '（未填写）'}</div>
                </div>
              </div>

              <div className="wbx-grid2">
                <div className="wbx-block">
                  <div className="wbx-label">暂时不碰</div>
                  {decision.notNow.length === 0 ? (
                    <div className="muted wbx-none">没有列出</div>
                  ) : (
                    <ul className="wbx-list">
                      {decision.notNow.map((t, i) => (
                        <li key={i}>
                          <span className="wbx-mark">⏸</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="wbx-block">
                  <div className="wbx-label">继续调查</div>
                  {decision.toInvestigate.length === 0 ? (
                    <div className="muted wbx-none">没有列出</div>
                  ) : (
                    <ul className="wbx-list">
                      {decision.toInvestigate.map((t, i) => (
                        <li key={i}>
                          <span className="wbx-mark">？</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {decision.conflictsFixed.length > 0 && (
                <div className="wbx-section">
                  <div className="wbx-section-title">三模块冲突已修复</div>
                  <ul className="wbx-list">
                    {decision.conflictsFixed.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {decision.enhancements.length > 0 && (
                <div className="wbx-section">
                  <div className="wbx-section-title">启用的增强模块</div>
                  <div className="wbx-chips">
                    {decision.enhancements.map(en => (
                      <span className="wbx-chip" key={en.key}>
                        <span className="wbx-chip-name">{enhancementName(en.key)}</span>
                        <span className="wbx-chip-point">{en.point}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {stale && <div className="wbx-stale">改过了，点「重新检查」更新检查结果</div>}

          <ChecksPanel
            title="硬性自检"
            checks={decision.checks}
            busy={busy !== null}
            onWaive={id => void run('save', () => waive(id))}
          />

          <div className="wbx-check-actions">
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void recheck()}>
              {busy === 'recheck' && <span className="spinner" />} 重新检查
            </button>
            {blocking.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void fixByChecks()}>
                {busy === 'fix' && <span className="spinner" />} 按检查意见修复
              </button>
            )}
          </div>

          {decision.confirmed ? (
            <div className="wbx-foot">
              <span className="badge badge-ok">已确认</span>
              <button type="button" className="btn btn-primary" onClick={() => goStep('wb_act')}>
                去行动 →
              </button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void unconfirm()}>
                取消确认
              </button>
            </div>
          ) : (
            <div className="wbx-foot">
              <button
                type="button"
                className="btn btn-primary"
                disabled={blocking.length > 0 || busy !== null}
                onClick={() => void confirmDecision()}
              >
                {busy === 'save' && <span className="spinner" />} 确认决策，进入行动 →
              </button>
              {blocking.length > 0 && <span className="muted">还有 {blocking.length} 项未通过：修复，或逐条标记已知晓</span>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
