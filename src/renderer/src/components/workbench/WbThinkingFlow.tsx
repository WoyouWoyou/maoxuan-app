import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  THINKING_DIMENSIONS,
  THINKING_METHODS,
  THINKING_QUADRANTS,
  thinkingMethod,
  thinkingSituation,
  type ThinkingMethod,
  type ThinkingResult
} from '@shared/workbench-thinking'
import type { WbStepProps } from './types'
import { toMessage } from './types'
import './WbThinkingFlow.css'

type Props = Pick<WbStepProps, 'session' | 'wb' | 'updateWb' | 'applyWorkbench' | 'openSource'>

function Lines({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function Contradiction({ data }: { data: NonNullable<ThinkingResult['contradiction']> }) {
  return (
    <section className="card wbt-analysis">
      <div className="wbt-kicker">找牛鼻子 · 一次只抓一个</div>
      <h2>{data.primary}</h2>
      <p>{data.why}</p>
      <details>
        <summary>显微镜：先看有哪些矛盾</summary>
        <Lines items={data.all} />
      </details>
      <div className="wbt-aspects">
        {(
          [
            ['主要方面 · 当前占上风', data.mainAspect],
            ['次要方面 · 寻找转化可能', data.secondaryAspect]
          ] as const
        ).map(([label, aspect]) => (
          <div className="wbt-aspect" key={label}>
            <span className="wbt-kicker">{label}</span>
            <h3>{aspect.name}</h3>
            <p>
              <b>力量与优势：</b>
              {aspect.strength}
            </p>
            <p>
              <b>弱点与限制：</b>
              {aspect.weakness}
            </p>
          </div>
        ))}
      </div>
      <h3>下关键棋 · 怎样创造转化条件</h3>
      <Lines items={data.turningConditions} />
      <p className="wbt-leverage">
        <b>先抓这个杠杆：</b>
        {data.leverage}
      </p>
    </section>
  )
}

function ObjSubj({ report }: { report: ThinkingResult }) {
  const data = report.objSubj
  if (!data) return null
  return (
    <section className="card wbt-analysis">
      <div className="wbt-kicker">看清世界，建设自己</div>
      <h2>成事 = 客观条件 × 主观能力</h2>
      <div className="wbt-aspects">
        {['客观条件 · 三看', '主观能力 · 两建'].map((title, group) => (
          <div key={title}>
            <h3>{title}</h3>
            <p>{group === 0 ? data.objective : data.subjective}</p>
            {THINKING_DIMENSIONS.objSubj
              .slice(group === 0 ? 0 : 3, group === 0 ? 3 : 5)
              .map((d) => {
                const item = report.information.find((i) => i.key === d.key)
                return item ? (
                  <div className="wbt-dimension" key={d.key}>
                    <h4>
                      {d.name}
                      <span className={`wbt-state is-${item.state}`}>
                        {{ sufficient: '充分', partial: '不足', missing: '空白' }[item.state]}
                      </span>
                    </h4>
                    <p>{item.judgment}</p>
                    <p className="muted">依据：{item.evidence}</p>
                    {item.missing && <p className="wbt-missing">待核实：{item.missing}</p>}
                  </div>
                ) : null
              })}
          </div>
        ))}
      </div>
      <div className="wbt-matrix" aria-label="主客分析四象限">
        {(['act', 'build', 'redirect', 'stop'] as const).map((key) => (
          <div key={key} className={data.quadrant === key ? 'is-selected' : ''}>
            {THINKING_QUADRANTS[key]}
            {data.quadrant === key && <span> ← 当前判断</span>}
          </div>
        ))}
      </div>
      <p className="wbt-leverage">
        <b>{THINKING_QUADRANTS[data.quadrant]}</b>
        <br />
        {data.conclusion}
      </p>
      <p>
        <b>关键缺口：</b>
        {data.gap}
      </p>
    </section>
  )
}

export function WbThinkingFlow({ session, wb, updateWb, applyWorkbench, openSource }: Props) {
  const [situation, setSituation] = useState(() => thinkingSituation(wb))
  const [method, setMethod] = useState<ThinkingMethod>(() => thinkingMethod(wb))
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const reportStart = useRef<HTMLDivElement>(null)
  const scrollAfterAnalysis = useRef(false)
  const report = wb.thinking
  useEffect(() => {
    if (scrollAfterAnalysis.current && report) {
      reportStart.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      scrollAfterAnalysis.current = false
    }
  }, [report])
  const stale = Boolean(report && (report.situation !== situation || report.method !== method))
  const meta = THINKING_METHODS.find((m) => m.key === method)!

  async function saveInput(text = situation, selected = method) {
    await updateWb((l) => ({
      ...l,
      form: { ...l.form, situation: text, thinkingMethod: selected }
    }))
  }

  async function run(text = situation) {
    if (running.current || !text.trim()) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await saveInput(text)
      const result = await window.api.wb.think(session.id)
      scrollAfterAnalysis.current = true
      await updateWb(
        (l) => ({
          ...l,
          thinking: result,
          actions: [
            ...l.actions,
            ...result.actions.filter((a) => !l.actions.some((old) => old.id === a.id))
          ]
        }),
        {
          versionLabel: `${meta.name}：${result.status === 'needs_info' ? '补充关键事实' : '分析与近期行动'}`
        }
      )
      setAnswers({})
    } catch (e) {
      scrollAfterAnalysis.current = false
      setError(toMessage(e))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  async function enqueue(id: string) {
    setAdding(id)
    setError('')
    try {
      await applyWorkbench([{ kind: 'enqueueActions', ids: [id] }], {
        versionLabel: '近期行动：加入待办'
      })
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setAdding(null)
    }
  }

  function supplement() {
    const supplement = report?.questions
      .flatMap((q, i) => (answers[i]?.trim() ? [`${q.question}\n${answers[i].trim()}`] : []))
      .join('\n\n')
    if (!supplement) return
    const next = `${situation.trim()}\n\n补充情况：\n${supplement}`
    setSituation(next)
    void run(next)
  }

  return (
    <div className="wbt-root">
      <section className="card wbt-input">
        <div className="wbt-kicker">从你的实际处境出发</div>
        <h1>把事情说出来，一起找突破口</h1>
        <p className="muted">选一个思考框架，用自己的话说。分析后，落到近期能做的事。</p>
        <div className="wbt-methods" role="group" aria-label="选择思考框架">
          {THINKING_METHODS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={method === item.key}
              className={`wbt-method${method === item.key ? ' is-selected' : ''}`}
              disabled={busy}
              onClick={() => {
                setMethod(item.key)
                setAnswers({})
                void saveInput(situation, item.key).catch((e) => setError(toMessage(e)))
              }}
            >
              <b>{item.name}</b>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
        <label htmlFor="thinking-situation" className="wbt-input-label">
          你现在遇到了什么事？
        </label>
        <textarea
          id="thinking-situation"
          className="textarea wbt-situation"
          rows={7}
          value={situation}
          disabled={busy}
          placeholder={
            method === 'contradiction'
              ? '比如：我在带一个项目，最近进度一直推不动……想做到什么、卡在哪里、已经试过什么，知道多少就说多少。'
              : '比如：我想下班后做一个小项目，不知道能不能成……现在什么阶段、看到了什么机会、自己有什么积累，知道多少就说多少。'
          }
          onChange={(e) => setSituation(e.target.value)}
          onBlur={() => {
            void saveInput().catch((e) => setError(toMessage(e)))
          }}
        />
        <div className="wbt-input-foot">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !situation.trim()}
            onClick={() => void run()}
          >
            {busy && <span className="spinner" />}
            {busy
              ? '正在分析，整理近期建议…'
              : report
                ? '重新分析，更新行动建议'
                : '开始分析，给我近期建议'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSource(method)}>
            {meta.source} · 看原文依据 →
          </button>
        </div>
        <p className="muted wbt-input-note">
          不用先列矛盾或打分；缺少影响判断的事实时，会先问你一两句。
        </p>
      </section>

      {error && (
        <div role="alert" className="error-text wbt-error">
          {error}
        </div>
      )}
      <div role="status" aria-live="polite">
        {busy && <p className="muted">正在用「{meta.name}」梳理你的处境，请稍候。</p>}
      </div>
      {report && (
        <div ref={reportStart} className={stale ? 'wbt-results is-stale' : 'wbt-results'}>
          {stale && (
            <div className="wbt-notice">描述或框架已更改。下面是上次分析，重新分析后会更新。</div>
          )}
          <section className="card wbt-insight">
            <div className="wbt-result-head">
              <span className="wbt-kicker">
                {THINKING_METHODS.find((m) => m.key === report.method)?.name} · 核心洞察
              </span>
              <span
                className={`wbt-state is-${report.status === 'ready' ? 'sufficient' : 'partial'}`}
              >
                {
                  {
                    ready: '基于现有事实',
                    tentative: '暂定判断 · 待验证',
                    needs_info: '信息不足 · 先调查'
                  }[report.status]
                }
              </span>
            </div>
            <p>{report.summary}</p>
          </section>

          {report.contradiction && <Contradiction data={report.contradiction} />}
          {report.objSubj && <ObjSubj report={report} />}

          {report.method === 'contradiction' && (
            <details className="card wbt-evidence" open={report.status === 'needs_info'}>
              <summary>判断依据 · 五项信息检查</summary>
              {THINKING_DIMENSIONS.contradiction.map((d) => {
                const info = report.information.find((i) => i.key === d.key)
                return info ? (
                  <div className="wbt-dimension" key={d.key}>
                    <h4>
                      {d.name}
                      <span className={`wbt-state is-${info.state}`}>
                        {{ sufficient: '充分', partial: '不足', missing: '空白' }[info.state]}
                      </span>
                    </h4>
                    <p>{info.evidence}</p>
                    <p className="muted">{info.judgment}</p>
                    {info.missing && <p className="wbt-missing">待补充：{info.missing}</p>}
                  </div>
                ) : null
              })}
            </details>
          )}

          {report.questions.length > 0 && !stale && (
            <section className="card wbt-questions">
              <h2>
                {report.status === 'needs_info' ? '先补充这点，再作判断' : '这点信息，会让判断更准'}
              </h2>
              {report.questions.map((q, i) => (
                <div className="field" key={`${report.generatedAt}:${i}`}>
                  <label className="field-label" htmlFor={`thinking-answer-${i}`}>
                    {q.question}
                  </label>
                  <p className="muted">{q.why}</p>
                  <textarea
                    className="textarea"
                    id={`thinking-answer-${i}`}
                    rows={2}
                    value={answers[i] ?? ''}
                    disabled={busy}
                    placeholder="知道多少就说多少"
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                  />
                </div>
              ))}
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !Object.values(answers).some((a) => a.trim())}
                onClick={supplement}
              >
                补充后继续分析
              </button>
            </section>
          )}

          <section className="card wbt-actions">
            <div className="wbt-result-head">
              <h2>近期行动推荐</h2>
              <span className="wbt-kicker">未来 7 天 · 先做最关键的一步</span>
            </div>
            {report.actions.map((recommendation, i) => {
              const action = wb.actions.find((a) => a.id === recommendation.id)
              const queued = action?.planningState === 'queued'
              const shown = action ?? recommendation
              return (
                <article className="wbt-action" key={recommendation.id}>
                  <div className="wbt-action-number">{i + 1}</div>
                  <div className="wbt-action-body">
                    {i === 0 && <span className="wbt-kicker">建议先做</span>}
                    <h3>{shown.action}</h3>
                    <p>
                      <b>
                        {report.status === 'needs_info'
                          ? '验证什么'
                          : report.method === 'contradiction'
                            ? '怎样推动转化'
                            : '补齐什么条件'}
                        ：
                      </b>
                      {shown.purpose}
                    </p>
                    <p>
                      <b>怎样算完成：</b>
                      {shown.verify}
                    </p>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={busy || stale || adding !== null || queued || !action}
                      onClick={() => void enqueue(recommendation.id)}
                    >
                      {adding === recommendation.id
                        ? '正在加入…'
                        : queued
                          ? action.status === 'done'
                            ? '已完成'
                            : action.status === 'dropped'
                              ? '已放弃'
                              : '已加入待办 ✓'
                          : !action
                            ? '已从工作清单移除'
                            : '加入待办'}
                    </button>
                  </div>
                </article>
              )
            })}
            <p className="muted">
              先选你要做的一步。<Link to="/actions">去工作清单记录进展 →</Link>
            </p>
          </section>
          {report.notNow.length > 0 && (
            <details className="card wbt-evidence">
              <summary>暂时不碰 · 把力量留给关键处</summary>
              <Lines items={report.notNow} />
            </details>
          )}
        </div>
      )}
      {(wb.actions.length > 0 || wb.ledger.length > 0) && (
        <details className="card wbt-evidence">
          <summary>已有行动与项目记录</summary>
          <p>
            <Link to="/actions">工作清单中查看已有行动及进展 →</Link>
          </p>
          {wb.ledger.length > 0 && (
            <Lines
              items={wb.ledger.map(
                (e) => `${e.createdAt.slice(0, 10)} · ${e.summary || e.rawInput}`
              )}
            />
          )}
        </details>
      )}
    </div>
  )
}
