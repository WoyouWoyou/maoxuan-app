import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowRight,
  ArrowsInLineHorizontal,
  ArrowsInLineVertical,
  CaretDown,
  Circle
} from '@phosphor-icons/react'
import type { WbAction } from '@shared/types'
import {
  THINKING_DIMENSIONS,
  THINKING_QUADRANTS,
  type ThinkingInformation,
  type ThinkingResult
} from '@shared/workbench-thinking'
import { ThinkingText } from './ThinkingText'

const STATES = { sufficient: '有依据', partial: '待验证', missing: '待补充' }

export function ReportHeading({
  number,
  children,
  hint
}: {
  number: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="wbt-section-heading">
      <span className="wbt-section-number" aria-hidden="true">
        {number}
      </span>
      <h2>{children}</h2>
      {hint && <span className="wbt-section-hint">{hint}</span>}
    </div>
  )
}

export function ReportList({ items }: { items: string[] }) {
  return (
    <ul className="wbt-detail-list">
      {items.map((item, i) => (
        <li key={i}>
          <ThinkingText text={item} lines={3} label={`第${i + 1}项`} />
        </li>
      ))}
    </ul>
  )
}

function FoldSection({
  title,
  count,
  children,
  className = ''
}: {
  title: string
  count?: number
  children: ReactNode
  className?: string
}) {
  return (
    <details className={`wbt-disclosure ${className}`}>
      <summary>
        <span>{title}</span>
        {count !== undefined && <span className="wbt-count">{count} 项</span>}
        <CaretDown size={14} className="wbt-disclosure-caret" />
      </summary>
      <div className="wbt-disclosure-body">{children}</div>
    </details>
  )
}

function Evidence({ information }: { information: ThinkingInformation[] }) {
  return (
    <div className="wbt-fact-notes">
      {information.map((info, i) => (
        <div className="wbt-fact-note" key={info.key}>
          <span className={`wbt-state is-${info.state}`}>
            {info.state === 'sufficient'
              ? `依据 ${String(i + 1).padStart(2, '0')}`
              : STATES[info.state]}
          </span>
          <ThinkingText text={info.evidence} lines={2} label={`依据${i + 1}`} />
          {info.state !== 'sufficient' && info.missing && (
            <ThinkingText
              className="wbt-missing"
              text={info.missing}
              lines={2}
              label={`待核实信息${i + 1}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function Aspect({
  data,
  secondary
}: {
  data: NonNullable<ThinkingResult['contradiction']>['mainAspect']
  secondary?: boolean
}) {
  return (
    <div className={`wbt-aspect${secondary ? ' is-secondary' : ''}`}>
      <p className="wbt-aspect-label">
        {secondary ? '次要方面 · 有待增强' : '主要方面 · 当前主导'}
      </p>
      <ThinkingText
        className="wbt-aspect-name"
        text={data.name}
        lines={2}
        label={secondary ? '次要方面名称' : '主要方面名称'}
      />
      <FoldSection title="力量与优势、弱点与限制">
        <dl className="wbt-field-list">
          <div>
            <dt>力量与优势</dt>
            <dd>
              <ThinkingText text={data.strength} lines={3} label="力量与优势" />
            </dd>
          </div>
          <div>
            <dt>弱点与限制</dt>
            <dd>
              <ThinkingText text={data.weakness} lines={3} label="弱点与限制" />
            </dd>
          </div>
        </dl>
      </FoldSection>
    </div>
  )
}

export function ContradictionReport({ report }: { report: ThinkingResult }) {
  const data = report.contradiction
  if (!data) return null
  const evidence = report.information.filter((info) => info.state !== 'missing').slice(0, 2)
  // 只拆分原文明确写出的对立双方，没有分隔符时保留原判断。
  const parts = data.primary.split(/\s+vs\s+/i)
  const hasPair = parts.length === 2 && parts.every((part) => part.trim())
  return (
    <section className="wbt-analysis wbt-layout wbt-contradiction-layout" aria-label="主要矛盾分析">
      <div className="wbt-conflict">
        <ReportHeading number="01">抓住这个主要矛盾</ReportHeading>
        {hasPair ? (
          <div className="wbt-tension" aria-label="主要矛盾的两个对立面">
            <div className="wbt-tension-side">
              <ThinkingText text={parts[0]} lines={2} label="矛盾第一方" />
            </div>
            <ArrowsInLineHorizontal size={28} className="wbt-tension-icon" aria-label="与之对立" />
            <div className="wbt-tension-side">
              <ThinkingText text={parts[1]} lines={2} label="矛盾第二方" />
            </div>
          </div>
        ) : (
          <ThinkingText className="wbt-primary" text={data.primary} lines={2} label="主要矛盾" />
        )}
        <div className="wbt-aspects">
          <Aspect data={data.mainAspect} />
          <ArrowsInLineVertical className="wbt-conflict-icon" size={24} aria-hidden="true" />
          <Aspect data={data.secondaryAspect} secondary />
        </div>
        <div className="wbt-leverage">
          <ArrowDown size={18} aria-hidden="true" />
          <div>
            <span className="wbt-kicker">转化杠杆</span>
            <ThinkingText text={data.leverage} lines={2} label="转化杠杆" />
          </div>
        </div>
        <FoldSection title="怎样创造转化条件" count={data.turningConditions.length}>
          <ReportList items={data.turningConditions} />
        </FoldSection>
      </div>
      <aside className="wbt-evidence-rail">
        <h3>为什么先抓它</h3>
        <Evidence information={evidence} />
        <div className="wbt-causal-reason">
          <ThinkingText text={data.why} lines={3} label="主要矛盾判断理由" />
        </div>
        <FoldSection title="完整矛盾清单" count={data.all.length}>
          <ReportList items={data.all} />
        </FoldSection>
        <FoldSection title="五项信息检查" count={report.information.length}>
          {report.information.map((info) => (
            <div className="wbt-dimension" key={info.key}>
              <h4>
                {THINKING_DIMENSIONS.contradiction.find((d) => d.key === info.key)?.name}
                <span className={`wbt-state is-${info.state}`}>{STATES[info.state]}</span>
              </h4>
              <ThinkingText text={info.evidence} lines={3} label="事实依据" />
              <ThinkingText className="wbt-note" text={info.judgment} lines={3} label="信息判断" />
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
        </FoldSection>
      </aside>
    </section>
  )
}

function Dimension({ info, name }: { info: ThinkingInformation; name: string }) {
  return (
    <details className="wbt-dimension wbt-ledger-row">
      <summary aria-label={`${name}的判断依据`}>
        <span className="wbt-dimension-name">
          {name}
          <span className={`wbt-state is-${info.state}`}>{STATES[info.state]}</span>
        </span>
        <span className="wbt-ledger-judgment wbt-row-preview">{info.judgment}</span>
        <span
          className={`wbt-ledger-evidence wbt-row-preview${info.state === 'missing' ? ' wbt-missing' : ''}`}
        >
          {info.state === 'missing' ? info.missing || '缺少判断依据' : info.evidence}
        </span>
        <CaretDown size={14} className="wbt-disclosure-caret" />
      </summary>
      <dl className="wbt-field-list wbt-dimension-detail">
        <div>
          <dt>当前判断</dt>
          <dd>
            <ThinkingText text={info.judgment} lines={3} label={`${name}当前判断`} />
          </dd>
        </div>
        <div>
          <dt>事实依据</dt>
          <dd>
            <ThinkingText text={info.evidence} lines={3} label={`${name}事实依据`} />
          </dd>
        </div>
        {info.missing && (
          <div>
            <dt>待核实</dt>
            <dd className="wbt-missing">
              <ThinkingText text={info.missing} lines={3} label={`${name}待核实信息`} />
            </dd>
          </div>
        )}
      </dl>
    </details>
  )
}

const QUADRANTS = [
  { key: 'build', title: '先练内功', hint: '边干边建' },
  { key: 'act', title: '全力出击', hint: '抓住窗口' },
  { key: 'stop', title: '止损或等待', hint: '先保基本盘' },
  { key: 'redirect', title: '换个方向', hint: '保存实力' }
] as const

export function ObjSubjReport({ report }: { report: ThinkingResult }) {
  const data = report.objSubj
  if (!data) return null
  return (
    <section className="wbt-analysis" aria-label="主客分析">
      <p className="wbt-formula">
        成事 = 客观条件 <span>×</span> 主观能力
      </p>
      <div className="wbt-layout wbt-objsubj-layout">
        <div className="wbt-ledger">
          <ReportHeading number="01">三看两建</ReportHeading>
          <div className="wbt-ledger-head">
            <span>维度</span>
            <span>当前判断</span>
            <span>依据与缺口</span>
          </div>
          {(['客观条件 · 识别与选择', '主观能力 · 建设与提升'] as const).map((title, group) => (
            <div className="wbt-ledger-group" key={title}>
              <FoldSection title={title} className="wbt-group-summary">
                <ThinkingText
                  text={group === 0 ? data.objective : data.subjective}
                  lines={4}
                  label={group === 0 ? '客观条件综合判断' : '主观能力综合判断'}
                />
              </FoldSection>
              {THINKING_DIMENSIONS.objSubj
                .slice(group === 0 ? 0 : 3, group === 0 ? 3 : 5)
                .map((d) => {
                  const info = report.information.find((i) => i.key === d.key)
                  return info ? (
                    <Dimension key={d.key} info={info} name={d.name.split(' · ')[0]} />
                  ) : null
                })}
            </div>
          ))}
        </div>
        <aside className="wbt-quadrant-rail">
          <ReportHeading number="02">你现在在哪里</ReportHeading>
          <div className="wbt-coordinate">
            <div className="wbt-axis-y">
              <span>好</span>
              <span>客观条件</span>
              <span>差</span>
            </div>
            <div
              className="wbt-matrix"
              role="group"
              aria-label={`主客分析四象限：${THINKING_QUADRANTS[data.quadrant]}`}
            >
              {QUADRANTS.map((q) => (
                <div
                  className={data.quadrant === q.key ? 'wbt-quadrant is-selected' : 'wbt-quadrant'}
                  key={q.key}
                >
                  <h3>{q.title}</h3>
                  <p>{q.hint}</p>
                  {data.quadrant === q.key && (
                    <span className="wbt-position">
                      <Circle size={10} weight="fill" />
                      {report.status === 'ready' ? '当前判断' : '暂定位置'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="wbt-axis-x">
              <span>弱</span>
              <span>主观能力</span>
              <span>强</span>
            </div>
          </div>
          <p className="wbt-matrix-note">
            {data.quadrant === 'unknown'
              ? '证据不足，暂不落入象限。'
              : '位置是判断，不是分数；随新事实调整。'}
          </p>
          <div className="wbt-gap">
            <span className="wbt-kicker">关键缺口</span>
            <ThinkingText text={data.gap} lines={2} label="关键缺口" />
          </div>
          <FoldSection title="查看可行性结论与适用条件">
            <ThinkingText text={data.conclusion} lines={4} label="可行性结论" />
          </FoldSection>
        </aside>
      </div>
    </section>
  )
}

export function ThinkingActions({
  report,
  actions,
  busy,
  stale,
  adding,
  onEnqueue
}: {
  report: ThinkingResult
  actions: WbAction[]
  busy: boolean
  stale: boolean
  adding: string | null
  onEnqueue: (id: string) => void
}) {
  const render = (recommendation: WbAction, index: number) => {
    const saved = actions.find((a) => a.id === recommendation.id)
    const shown = saved ?? recommendation
    const queued = saved?.planningState === 'queued'
    return (
      <article className={`wbt-action${index === 0 ? ' is-first' : ''}`} key={shown.id}>
        <span className="wbt-action-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="wbt-action-main">
          <ThinkingText
            className="wbt-action-title"
            text={shown.action}
            lines={2}
            label={`行动${index + 1}`}
          />
          <div className="wbt-action-purpose">
            <span>为什么</span>
            <ThinkingText text={shown.purpose} lines={1} label={`行动${index + 1}的目的`} />
          </div>
        </div>
        <div className="wbt-action-verify">
          <span>完成标准</span>
          <ThinkingText text={shown.verify} lines={2} label={`行动${index + 1}的完成标准`} />
        </div>
        <button
          type="button"
          className={`btn ${index === 0 ? 'btn-primary' : ''} wbt-action-enqueue`}
          disabled={busy || stale || adding !== null || queued || !saved}
          onClick={() => onEnqueue(shown.id)}
        >
          {adding === shown.id
            ? '正在加入…'
            : queued
              ? saved.status === 'done'
                ? '已完成'
                : saved.status === 'dropped'
                  ? '已放弃'
                  : '已加入待办'
              : !saved
                ? '已移除'
                : '加入待办'}
          {!queued && saved && <ArrowRight size={15} />}
        </button>
      </article>
    )
  }
  return (
    <section className="wbt-actions" aria-label="近期行动推荐">
      <ReportHeading
        number={report.method === 'objSubj' ? '03' : '02'}
        hint="未来 7 天 · 先做最关键的一步"
      >
        近期行动推荐
      </ReportHeading>
      {report.actions[0] && render(report.actions[0], 0)}
      {report.actions.length > 1 && (
        <FoldSection
          title="其余近期行动"
          count={report.actions.length - 1}
          className="wbt-other-actions"
        >
          {report.actions.slice(1).map((a, i) => render(a, i + 1))}
        </FoldSection>
      )}
      <Link to="/actions" className="wbt-worklist-link">
        去工作清单记录进展 <ArrowRight size={14} />
      </Link>
      {report.notNow.length > 0 && (
        <FoldSection title="暂时不碰" count={report.notNow.length} className="wbt-not-now">
          <ReportList items={report.notNow} />
        </FoldSection>
      )}
    </section>
  )
}
