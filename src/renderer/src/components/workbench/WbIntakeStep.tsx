import { useState } from 'react'
import type { WbConfidence, WbFact, WbFactKind, WbForm, WbStage, WbTimeScale } from '@shared/types'
import {
  WB_SOURCES,
  WB_STAGES,
  WB_STAGE_HINT,
  WB_TIME_SCALES,
  isAssumptionDraft,
  nextFactNo,
  wbStepUnlocked
} from '@shared/workbench'
import type { WbStepProps } from './types'
import { toMessage } from './types'
import './wb.css'

const KIND_ORDER: WbFactKind[] = ['fact', 'judgment', 'wish']

const KIND_LABEL: Record<WbFactKind, string> = {
  fact: '事实',
  judgment: '判断',
  wish: '愿望'
}

const CONF_LABEL: Record<WbConfidence, string> = {
  confirmed: '已确认',
  assumed: '假设',
  uncertain: '不确定'
}

const CONF_NEXT: Record<WbConfidence, WbConfidence> = {
  confirmed: 'assumed',
  assumed: 'uncertain',
  uncertain: 'confirmed'
}

const BLOCKER_PLACEHOLDER = [
  '卡点 1：具体卡在哪，不写口号',
  '卡点 2：具体卡在哪，不写口号',
  '卡点 3：具体卡在哪，不写口号'
]

function sameForm(a: WbForm, b: WbForm): boolean {
  return (
    a.projectName === b.projectName &&
    a.objective === b.objective &&
    a.timeScale === b.timeScale &&
    a.stage === b.stage &&
    a.background === b.background &&
    a.knownFacts === b.knownFacts &&
    a.opponents === b.opponents &&
    a.allies === b.allies &&
    a.swing === b.swing &&
    a.blockers.join('\u0001') === b.blockers.join('\u0001')
  )
}

export function WbIntakeStep({ session, wb, updateWb, goStep, openSource }: WbStepProps) {
  const [draft, setDraft] = useState<WbForm>(wb.form)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newFact, setNewFact] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const intake = wb.intake
  const gate = wbStepUnlocked(wb, 'wb_diagnose')
  const source = WB_SOURCES.find((s) => s.area === 'intake')

  const timeHint = WB_TIME_SCALES.find((s) => s.key === draft.timeScale)?.hint ?? ''
  const stageHint = draft.stage ? WB_STAGE_HINT[draft.stage] : ''

  const unanswered = intake ? intake.questions.filter((q) => q.answer.trim() === '').length : 0
  const confirmedCount = intake
    ? intake.facts.filter((f) => f.kind === 'fact' && f.confidence === 'confirmed').length
    : 0
  const assumptionNote =
    unanswered > 0
      ? `还有 ${unanswered} 个追问没回答`
      : confirmedCount > 0
        ? `目前只有 ${confirmedCount} 条已确认的事实`
        : '还没有已确认的事实'

  function setField(patch: Partial<WbForm>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function setBlocker(index: number, value: string) {
    setDraft((prev) => {
      const blockers = [...prev.blockers]
      blockers[index] = value
      return { ...prev, blockers }
    })
  }

  function persist() {
    if (sameForm(draft, wb.form)) return
    void updateWb((l) => ({ ...l, form: draft }))
  }

  function pickTimeScale(value: WbTimeScale) {
    const next: WbForm = { ...draft, timeScale: draft.timeScale === value ? '' : value }
    setDraft(next)
    void updateWb((l) => ({ ...l, form: next }))
  }

  function pickStage(value: WbStage) {
    const next: WbForm = { ...draft, stage: draft.stage === value ? '' : value }
    setDraft(next)
    void updateWb((l) => ({ ...l, form: next }))
  }

  function patchFacts(fn: (facts: WbFact[]) => WbFact[]) {
    void updateWb((l) =>
      l.intake ? { ...l, intake: { ...l.intake, facts: fn(l.intake.facts) } } : l
    )
  }

  function patchFact(id: string, patch: Partial<WbFact>) {
    patchFacts((facts) => facts.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeFact(id: string) {
    patchFacts((facts) => facts.filter((f) => f.id !== id))
  }

  function cycleConf(fact: WbFact) {
    patchFact(fact.id, { confidence: CONF_NEXT[fact.confidence] })
  }

  function addFact() {
    const content = newFact.trim()
    if (!content || !intake) return
    const id = `F${nextFactNo(intake.facts.map((f) => f.id))}`
    setNewFact('')
    patchFacts((facts) => [...facts, { id, kind: 'fact', content, confidence: 'confirmed' }])
  }

  function setAnswer(index: number, answer: string) {
    void updateWb((l) =>
      l.intake
        ? {
            ...l,
            intake: {
              ...l.intake,
              questions: l.intake.questions.map((q, i) => (i === index ? { ...q, answer } : q))
            }
          }
        : l
    )
  }

  async function runIntake() {
    if (busy) return
    const first = wb.ledger.length === 0
    setBusy(true)
    setErr('')
    try {
      await updateWb((l) => ({ ...l, form: draft }))
      const res = await window.api.wb.intake(session.id)
      await updateWb((l) => ({ ...l, intake: res }), {
        versionLabel: first ? '第一步：整理事实台账' : '第一步：补充事实后重整'
      })
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(false)
    }
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSource('intake')}>
          看原文依据 →
        </button>
      </div>

      <div className="card wb-card">
        <div className="card-title">原始输入</div>
        <p className="muted wb-card-sub">
          一个项目只围绕一个主目标；数字、资源、约束写得越实，判断越准
        </p>

        <div className="field">
          <div className="field-label">项目名</div>
          <input
            className="input"
            value={draft.projectName}
            placeholder="例：社区烘焙店"
            onChange={(e) => setField({ projectName: e.target.value })}
            onBlur={persist}
          />
        </div>

        <div className="field">
          <div className="field-label">主目标</div>
          <div className="field-hint">一个项目只围绕一个主目标，支线目标后面单独说</div>
          <textarea
            className="textarea"
            rows={2}
            value={draft.objective}
            placeholder="例：12 个月内把单店做到月流水 10 万并稳定盈利"
            onChange={(e) => setField({ objective: e.target.value })}
            onBlur={persist}
          />
        </div>

        <div className="field">
          <div className="field-label">时间尺度</div>
          <div className="wb-chips">
            {WB_TIME_SCALES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`wb-chip${draft.timeScale === item.key ? ' is-on' : ''}`}
                onClick={() => pickTimeScale(item.key)}
              >
                {item.key}
              </button>
            ))}
          </div>
          <div className="wb-chip-hint">{timeHint || '先选一个时间尺度，后面的判断要按它来定'}</div>
        </div>

        <div className="field">
          <div className="field-label">当前阶段</div>
          <div className="wb-chips">
            {WB_STAGES.map((item) => (
              <button
                key={item}
                type="button"
                className={`wb-chip${draft.stage === item ? ' is-on' : ''}`}
                onClick={() => pickStage(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="wb-chip-hint">{stageHint || '先判断自己在哪个阶段，打法完全不同'}</div>
        </div>

        <div className="field">
          <div className="field-label">当前最卡的 3 个问题</div>
          <div className="wb-grid3">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                className="input"
                value={draft.blockers[i]}
                placeholder={BLOCKER_PLACEHOLDER[i]}
                onChange={(e) => setBlocker(i, e.target.value)}
                onBlur={persist}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-label">背景</div>
          <div className="field-hint">这件事怎么来的？涉及谁、多少钱、拖了多久？</div>
          <textarea
            className="textarea"
            rows={3}
            value={draft.background}
            onChange={(e) => setField({ background: e.target.value })}
            onBlur={persist}
          />
        </div>

        <div className="field">
          <div className="field-label">已知的客观事实</div>
          <div className="field-hint">数字、资源、约束、已做动作和结果</div>
          <textarea
            className="textarea"
            rows={4}
            value={draft.knownFacts}
            placeholder="例：月租 8000，日客流 60 人，客单价 25 元，现金流还能撑 4 个月"
            onChange={(e) => setField({ knownFacts: e.target.value })}
            onBlur={persist}
          />
        </div>

        <div className="wb-grid3">
          <div className="field">
            <div className="field-label">敌 · 主要阻力</div>
            <div className="field-hint">挡在目标前面的东西</div>
            <textarea
              className="textarea"
              rows={2}
              value={draft.opponents}
              onChange={(e) => setField({ opponents: e.target.value })}
              onBlur={persist}
            />
          </div>
          <div className="field">
            <div className="field-label">友 · 稳定助力</div>
            <div className="field-hint">已经在帮你的力量</div>
            <textarea
              className="textarea"
              rows={2}
              value={draft.allies}
              onChange={(e) => setField({ allies: e.target.value })}
              onBlur={persist}
            />
          </div>
          <div className="field">
            <div className="field-label">可争取力量</div>
            <div className="field-hint">中间地带、潜在支持者、可借资源</div>
            <textarea
              className="textarea"
              rows={2}
              value={draft.swing}
              onChange={(e) => setField({ swing: e.target.value })}
              onBlur={persist}
            />
          </div>
        </div>
      </div>

      <div className="wb-bar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void runIntake()}
        >
          {busy && <span className="spinner" />} {intake ? '根据补充重新整理' : '整理事实台账'}
        </button>
        <span className="muted wb-bar-note">AI 只切分你给的内容，不会添加你没说过的事实</span>
        {err && <span className="error-text">{err}</span>}
      </div>

      {intake && (
        <>
          {isAssumptionDraft(wb) && (
            <div className="wb-warn">
              判断依赖补充事实：{assumptionNote}。可以继续，但后面的结论都是假设版。
            </div>
          )}

          <div className="card wb-card">
            <div className="card-title">事实台账</div>
            <p className="muted wb-card-sub">只有“事实”能被后面的判断引用；判断和愿望先分开放着</p>
            <div className="wb-grid3">
              {KIND_ORDER.map((kind) => {
                const items = intake.facts.filter((f) => f.kind === kind)
                return (
                  <div className="wb-ledger-col" key={kind}>
                    <div className="wb-col-head">
                      {KIND_LABEL[kind]}
                      <span className="badge">{items.length}</span>
                    </div>
                    <div className="wb-fact-list">
                      {items.map((fact) => (
                        <div className="wb-fact" key={fact.id}>
                          <div className="wb-fact-head">
                            <span className="wb-fact-id">{fact.id}</span>
                            <span className="spacer" />
                            <button
                              type="button"
                              className={`wb-conf wb-conf-${fact.confidence}`}
                              title="点击切换：已确认 → 假设 → 不确定"
                              onClick={() => cycleConf(fact)}
                            >
                              {CONF_LABEL[fact.confidence]}
                            </button>
                            <select
                              className="wb-kind"
                              value={fact.kind}
                              title="改分类"
                              onChange={(e) =>
                                patchFact(fact.id, { kind: e.target.value as WbFactKind })
                              }
                            >
                              {KIND_ORDER.map((k) => (
                                <option key={k} value={k}>
                                  {KIND_LABEL[k]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="wb-del"
                              title="删除这条"
                              onClick={() => removeFact(fact.id)}
                            >
                              ×
                            </button>
                          </div>
                          {editingId === fact.id ? (
                            <input
                              className="input wb-fact-input"
                              autoFocus
                              defaultValue={fact.content}
                              onBlur={(e) => {
                                setEditingId(null)
                                const value = e.target.value.trim()
                                if (value && value !== fact.content)
                                  patchFact(fact.id, { content: value })
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                              }}
                            />
                          ) : (
                            <div
                              className="wb-fact-content"
                              title="点击编辑"
                              onClick={() => setEditingId(fact.id)}
                            >
                              {fact.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {kind === 'fact' && (
                      <div className="wb-add">
                        <input
                          className="input"
                          value={newFact}
                          placeholder="手动补一条已确认的事实"
                          onChange={(e) => setNewFact(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addFact()
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={!newFact.trim()}
                          onClick={addFact}
                        >
                          添加
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card wb-card">
            <div className="card-title">还缺哪些关键事实</div>
            {intake.missing.length === 0 ? (
              <div className="muted">没有明显缺口，可以直接进三路诊断。</div>
            ) : (
              <div className="wb-miss-list">
                {intake.missing.map((item, i) => (
                  <div className="wb-miss" key={`${i}-${item}`}>
                    <i className="wb-dot" />
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card wb-card">
            <div className="card-title">追问</div>
            {intake.questions.length === 0 ? (
              <div className="muted">暂时没有要补的问题。</div>
            ) : (
              intake.questions.map((q, i) => (
                <div className="wb-q" key={q.id}>
                  <div className="wb-q-head">
                    <span className="wb-q-text">{q.question}</span>
                    <span className="spacer" />
                    {q.answer.trim() !== '' && <span className="badge badge-ok">已回答</span>}
                  </div>
                  <div className="muted wb-q-why">为什么问：{q.why}</div>
                  <textarea
                    className="textarea"
                    rows={3}
                    key={`${q.id}:${q.answer}`}
                    defaultValue={q.answer}
                    placeholder="把你知道的写清楚：数字、时间、人名、结果"
                    onBlur={(e) => {
                      if (e.target.value !== q.answer) setAnswer(i, e.target.value)
                    }}
                  />
                </div>
              ))
            )}
            <p className="muted wb-card-sub">
              回答完点上面的『根据补充重新整理』，回答会转成事实。
            </p>
          </div>

          <div className="card wb-card">
            <div className="card-title">主线</div>
            <p className="wb-mainline">{intake.mainline}</p>
            {intake.sideGoals.length > 0 && (
              <>
                <div className="wb-sub-title">建议拆成独立项目的支线</div>
                <ul className="wb-side">
                  {intake.sideGoals.map((goal, i) => (
                    <li key={`${i}-${goal}`}>{goal}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      <div className="wb-bar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!gate.ok}
          onClick={() => goStep('wb_diagnose')}
        >
          进入三路诊断 →
        </button>
        {!gate.ok && <span className="muted">{gate.reason}</span>}
      </div>
    </div>
  )
}
