import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CaretDown, NotePencil } from '@phosphor-icons/react'
import {
  THINKING_DIMENSIONS,
  THINKING_METHODS,
  thinkingMethod,
  thinkingSituation,
  thinkingReport,
  type ThinkingMethod
} from '@shared/workbench-thinking'
import type { WbStepProps } from './types'
import { toMessage } from './types'
import { ThinkingText } from './ThinkingText'
import { ContradictionReport, ObjSubjReport, ReportList, ThinkingActions } from './ThinkingReport'
import './WbThinkingFlow.css'

type Props = Pick<WbStepProps, 'session' | 'wb' | 'updateWb' | 'applyWorkbench' | 'openSource'>

export function WbThinkingFlow({ session, wb, updateWb, applyWorkbench, openSource }: Props) {
  const [situation, setSituation] = useState(() => thinkingSituation(wb))
  const [method, setMethod] = useState<ThinkingMethod>(() => thinkingMethod(wb))
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(!thinkingReport(wb))
  const [adding, setAdding] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const reportStart = useRef<HTMLDivElement>(null)
  const scrollAfterAnalysis = useRef(false)
  const report = thinkingReport(wb, method)
  useEffect(() => {
    if (scrollAfterAnalysis.current && report) {
      reportStart.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      scrollAfterAnalysis.current = false
    }
  }, [report])
  const stale = Boolean(report && (report.situation !== situation))
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
      setEditing(false)
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
      <div className="wbt-methodbar">
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
                if (item.key !== method) setEditing(!thinkingReport(wb, item.key))
                void saveInput(situation, item.key).catch((e) => setError(toMessage(e)))
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="wbt-method-tools">
          <button type="button" className="wbt-source-link" onClick={() => openSource(method)}>
            方法源自{meta.source}
            <ArrowRight size={13} />
          </button>
          <div className="wbt-editor-toggle">
            <button
              type="button"
              className="wbt-edit-button"
              disabled={busy}
              aria-expanded={editing}
              aria-controls="thinking-editor"
              onClick={() => setEditing((value) => !value)}
            >
              <NotePencil size={16} />
              {editing ? (report ? '收起情境' : '描述情境') : '编辑情境'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <section className="wbt-input" id="thinking-editor" aria-label="处境描述">
          {!report && (
            <>
              <span className="wbt-kicker">从你的实际处境出发</span>
              <h1>把事情说出来，一起找突破口</h1>
              <p className="wbt-note">选一个思考框架，用自己的话说。分析后，落到近期能做的事。</p>
            </>
          )}
          <label htmlFor="thinking-situation" className="wbt-input-label">
            你现在遇到了什么事？
          </label>
          <textarea
            id="thinking-situation"
            className="textarea wbt-situation"
            rows={5}
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
            <span className="wbt-note">不用先列矛盾或打分；缺关键事实时，会先问你一两句。</span>
          </div>
        </section>
      )}
      {error && (
        <div role="alert" className="error-text wbt-error">
          {error}
        </div>
      )}
      {busy && (
        <p className="wbt-note" role="status" aria-live="polite">
          正在用「{meta.name}」梳理你的处境，请稍候。
        </p>
      )}

      {report && (
        <div
          key={report.generatedAt}
          ref={reportStart}
          className={`wbt-results${stale ? ' is-stale' : ''}`}
        >
          {stale && (
            <div className="wbt-notice">描述已更改。下面是该框架的上次分析，重新分析后会更新。</div>
          )}
          <header className="wbt-insight">
            <div className="wbt-result-head">
              <h1 className="wbt-kicker">
                {report.method === 'contradiction' ? '分析结论' : '可行性判断'}
              </h1>
              <span
                className={`wbt-state is-${report.status === 'ready' ? 'sufficient' : report.status === 'needs_info' ? 'missing' : 'partial'}`}
              >
                {
                  {
                    ready: '基于现有事实 · 判断可修正',
                    tentative: '暂定判断 · 仍需验证',
                    needs_info: '信息不足 · 先调查'
                  }[report.status]
                }
              </span>
            </div>
            <ThinkingText
              className="wbt-hero-summary"
              text={report.summary}
              lines={2}
              label="核心判断"
            />
          </header>
          {report.contradiction && <ContradictionReport report={report} />}
          {report.objSubj && <ObjSubjReport report={report} />}

          {report.questions.length > 0 && !stale && (
            <details className="wbt-questions wbt-disclosure" open={report.status === 'needs_info'}>
              <summary>
                <span>
                  {report.status === 'needs_info' ? '先补充这点，再作判断' : '补充信息，让判断更准'}
                </span>
                <span className="wbt-count">{report.questions.length} 个问题</span>
                <CaretDown size={14} className="wbt-disclosure-caret" />
              </summary>
              <div className="wbt-question-fields">
                {report.questions.map((q, i) => (
                  <div className="field" key={i}>
                    <div className="field-label">
                      <ThinkingText text={q.question} lines={3} label={`问题${i + 1}`} />
                    </div>
                    <ThinkingText
                      className="wbt-note"
                      text={q.why}
                      lines={2}
                      label={`问题${i + 1}的原因`}
                    />
                    <textarea
                      className="textarea"
                      id={`thinking-answer-${i}`}
                      aria-label={q.question}
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
              </div>
            </details>
          )}
          {!report.contradiction && !report.objSubj && (
            <details className="wbt-disclosure wbt-incomplete">
              <summary>
                <span>已有信息与缺口</span>
                <span className="wbt-count">{report.information.length} 项</span>
                <CaretDown size={14} className="wbt-disclosure-caret" />
              </summary>
              {report.information.map((info) => (
                <div className="wbt-dimension" key={info.key}>
                  <h3>
                    {THINKING_DIMENSIONS[report.method].find((d) => d.key === info.key)?.name}
                  </h3>
                  <ThinkingText text={info.evidence} lines={3} label="现有信息" />
                  {info.missing && (
                    <ThinkingText
                      className="wbt-missing"
                      text={info.missing}
                      lines={2}
                      label="信息缺口"
                    />
                  )}
                </div>
              ))}
            </details>
          )}
          <ThinkingActions
            report={report}
            actions={wb.actions}
            busy={busy}
            stale={stale}
            adding={adding}
            onEnqueue={(id) => void enqueue(id)}
          />
        </div>
      )}
      {(wb.actions.length > 0 || wb.ledger.length > 0) && (
        <details className="wbt-disclosure wbt-history">
          <summary>
            <span>已有行动与项目记录</span>
            <CaretDown size={14} className="wbt-disclosure-caret" />
          </summary>
          <p>
            <Link to="/actions">
              工作清单中查看已有行动及进展 <ArrowRight size={14} />
            </Link>
          </p>
          {wb.ledger.length > 0 && (
            <ReportList
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
