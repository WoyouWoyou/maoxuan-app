import { marchStory } from '@shared/long-march-stories'
import { storyResources } from './story-assets'
import { MarchStoryCard } from './MarchStoryCard'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Images,
  LockSimple,
  Plant,
  BookOpen,
  X
} from '@phosphor-icons/react'
import {
  ACTIVITY_POINTS,
  DAILY_GROWTH_LIMIT,
  MARCH_NODES,
  TREE_COST,
  type MarchNode,
  type MarchProgress
} from '@shared/long-march'
import { RouteMap, NodePlantIcon } from './RouteMap'
import { ActivitySummary } from './ActivitySummary'
import { MarchAlbum } from './MarchAlbum'
import { MarchScenery } from './MarchScenery'
import { grown } from './presentation'
import { useMarchProgress } from './useMarchProgress'
import './long-march.css'

const totalPlants = MARCH_NODES.reduce((sum, node) => sum + node.target, 0)
const accessible = (p: MarchProgress, n: MarchNode) => {
  const i = MARCH_NODES.indexOf(n)
  return i === 0 || grown(p, MARCH_NODES[i - 1])
}

export function LongMarchPage() {
  const { nodeId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { progress, busy, error, refresh, plant, collect } = useMarchProgress()
  const [selected, setSelected] = useState('')
  const [rules, setRules] = useState(false)
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!rules) return
    const previous = document.activeElement as HTMLElement | null
    const box = dialog.current
    const focusable = () =>
      Array.from(box?.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]') ?? [])
    focusable()[0]?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setRules(false)
      }
      if (event.key !== 'Tab') return
      const elements = focusable(),
        first = elements[0],
        last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('keydown', keyboard)
      previous?.focus()
    }
  }, [rules])
  const isAlbum = location.pathname === '/long-march/album'
  const isScenery = location.pathname.endsWith('/scenery')
  const current = progress
    ? (MARCH_NODES.find((n) => !grown(progress, n)) ?? MARCH_NODES[MARCH_NODES.length - 1])
    : MARCH_NODES[0]
  const node = nodeId
    ? MARCH_NODES.find((n) => n.id === nodeId)
    : (MARCH_NODES.find((n) => n.id === selected) ?? current)
  useEffect(() => {
    setNotice('')
  }, [location.pathname])
  if (!progress)
    return (
      <div className="march-loading" role="status">
        {error || '正在展开这一程山河…'}
        {error && (
          <button className="btn" onClick={() => void refresh()}>
            重新载入
          </button>
        )}
      </div>
    )
  if (!node)
    return (
      <div className="march-loading">
        没有找到这一站。<Link to="/long-march">返回地图</Link>
      </div>
    )
  const count = progress.plants[node.id] ?? 0
  const complete = grown(progress, node)
  const reachable = accessible(progress, node)
  const planted = Object.values(progress.plants).reduce((a, b) => a + b, 0)
  const plantTree = async () => {
    const next = await plant(node.id)
    if (!next) return
    if (grown(next, node))
      navigate(`/long-march/${node.id}/scenery`, { state: { newlyUnlocked: true } })
    else setNotice(`已为${node.name}种下第 ${next.plants[node.id]} 株${node.plant}。`)
  }
  const feedback = (
    <>
      {error && (
        <div className="march-message is-error" role="alert">
          {error}
          <button aria-label="刷新进度" onClick={() => void refresh()}>
            刷新进度
          </button>
        </div>
      )}
      {notice && (
        <div className="march-message" role="status">
          {notice}
        </div>
      )}
    </>
  )
  if (isScenery && complete)
    return (
      <MarchScenery
        node={node}
        progress={progress}
        busy={busy}
        feedback={feedback}
        collect={collect}
      />
    )
  if (isAlbum) return <MarchAlbum progress={progress} />
  return (
    <section className="march-page">
      <header className="march-header">
        <div>
          {nodeId && (
            <button
              className="march-text-button march-back"
              onClick={() => navigate('/long-march')}
            >
              <ArrowLeft /> 返回路线
            </button>
          )}
          <span className="march-kicker">
            {nodeId
              ? `第 ${MARCH_NODES.indexOf(node) + 1} 站 / ${MARCH_NODES.length} 站 · ${node.date}`
              : '一程山河，一路生长'}
          </span>
          <h1>{nodeId ? `${node.name} · ${node.chapter}` : '长征不怕远征难'}</h1>
          <p>{nodeId ? '让思考扎根，让行动成林。' : '把每一次思考，种成沿途的风景。'}</p>
        </div>
        <div className="march-header-actions">
          <button className="march-text-button" onClick={() => navigate('/long-march/album')}>
            <Images size={19} /> 风景画册
          </button>
          <button className="march-text-button" onClick={() => setRules(true)}>
            成长规则
          </button>
        </div>
      </header>
      {feedback}
      {nodeId ? (
        <div className="march-detail-layout march-story-layout">
          <MarchStoryCard key={node.id} node={node} />
          <aside className="march-node-panel">
            <span className="march-kicker">这一站的林木</span>
            <div className="march-big-count">
              {count}
              <span>/ {node.target} 株</span>
            </div>
            <h2>
              <NodePlantIcon nodeId={node.id} size={28} />
              {node.plant}
            </h2>
            <p>{node.habitat}</p>
            <div className="march-story-growth">
              <div className="march-grove" aria-label={`已种植 ${count} 株${node.plant}`}>
                {Array.from({ length: node.target }, (_, i) => (
                  <span key={i} className={i < count ? 'is-grown' : ''}>
                    <NodePlantIcon nodeId={node.id} size={28} />
                    <small>{i < count ? '已扎根' : '待生长'}</small>
                  </span>
                ))}
              </div>
            </div>
            <hr />
            <h3>让一份记录，长成一株新绿</h3>
            <p>
              完成阅读、写下思考、记录行动进展或完成行动，每项有效记录增加 {ACTIVITY_POINTS}{' '}
              成长值，每天最多获得 {DAILY_GROWTH_LIMIT} 点（北京时间）。今日已获得{' '}
              {progress.todayEarned} 点。
            </p>
            <div className="march-balance">
              <span>可用成长值</span>
              <strong>{progress.balance}</strong>
            </div>
            <button
              className="btn btn-primary march-primary"
              disabled={busy || !reachable || count >= node.target || progress.balance < TREE_COST}
              onClick={() => void plantTree()}
            >
              <Plant />
              {busy
                ? '正在扎根…'
                : count >= node.target
                  ? complete
                    ? '这一站已成林'
                    : '静待新绿，满3天解锁'
                  : !reachable
                    ? '先完成上一站'
                    : progress.balance < TREE_COST
                      ? '记录之后，再来种树'
                      : `种下一株${node.plant}`}
            </button>
            <small className="march-cost">每株消耗 {TREE_COST} 成长值 · 进度自动保存</small>
            {complete ? (
              <button
                className="btn march-primary"
                onClick={() => navigate(`/long-march/${node.id}/scenery`)}
              >
                欣赏已解锁风景 <ArrowRight />
              </button>
            ) : (
              <p className="march-unlock-hint">
                <LockSimple />
                {progress.unlockAt[node.id]
                  ? `本站种满后，于 ${new Date(progress.unlockAt[node.id]).toLocaleString('zh-CN')} 解锁风景与下一站。`
                  : '种下第一株植物起满72小时，且种满4株，解锁本站风景与下一站。'}
              </p>
            )}
            <Link className="march-reading-link" to="/library">
              去阅读，积累成长值 <ArrowRight />
            </Link>
            <hr />
            <h3>{node.chapter}</h3>
            <p>{node.story}</p>
          </aside>
        </div>
      ) : (
        <>
          <div className="march-overview-layout">
            <RouteMap progress={progress} selected={node.id} onSelect={setSelected} />
            <aside className="march-overview-panel">
              <span className="march-kicker">
                {complete ? '已经成林' : reachable ? '当前旅程' : '前方的山河'} · {node.date}
              </span>
              <h2>
                {node.name} · {node.chapter}
              </h2>
              <p>{node.story}</p>
              <button
                className="march-landscape-preview"
                onClick={() => navigate(`/long-march/${node.id}`)}
                aria-label={`走近${node.name}`}
              >
                <img src={storyResources(node.id).image} alt={marchStory(node.id).illustration} />
                <span>
                  <BookOpen size={16} />
                  听这一站的故事
                </span>
              </button>
              <div className="march-station-progress">
                <span>本站生长</span>
                <strong>
                  {count} / {node.target}
                </strong>
              </div>
              <progress value={count} max={node.target} aria-label="本站植树进度" />
              <p className="march-overview-hint">
                {node.habitat}。
                {reachable
                  ? '用记录积累成长，让沿途慢慢葱茏。'
                  : '可以先听这一站的故事，完成前站后再来种植。'}
              </p>
              <button
                className="btn btn-primary march-primary"
                onClick={() => navigate(`/long-march/${node.id}`)}
              >
                走近这一站 <ArrowRight />
              </button>
            </aside>
          </div>
          <ActivitySummary progress={progress} />
          <div className="march-journey-footer">
            <span>
              已种下 {planted} / {totalPlants} 株 · 已完成{' '}
              {MARCH_NODES.filter((n) => grown(progress, n)).length} / {MARCH_NODES.length} 站
            </span>
            <span>中央红军 · 1934—1935</span>
          </div>
          <nav className="march-station-strip" aria-label="选择长征节点">
            {MARCH_NODES.map((n, i) => (
              <button
                key={n.id}
                className={node.id === n.id ? 'is-selected' : ''}
                onClick={() => setSelected(n.id)}
              >
                <small>{String(i + 1).padStart(2, '0')}</small>
                {n.name}
                {grown(progress, n) && <Check size={13} />}
              </button>
            ))}
          </nav>
        </>
      )}
      {rules && (
        <div
          className="march-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRules(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setRules(false)
          }}
        >
          <div
            ref={dialog}
            className="march-rules"
            role="dialog"
            aria-modal="true"
            aria-labelledby="march-rules-title"
          >
            <button
              className="march-modal-close"
              aria-label="关闭成长规则"
              autoFocus
              onClick={() => setRules(false)}
            >
              <X />
            </button>
            <span className="march-kicker">从记录，到一片新绿</span>
            <h2 id="march-rules-title">每一步，都算数</h2>
            <p>
              完成一次阅读、确认一份非空笔记、写下一条思考、记录一次行动进展或完成一项行动，各获得{' '}
              {ACTIVITY_POINTS}{' '}
              成长值（每天合计最多20点）。工作台中已进入工作清单的行动同样计入。首次完成一篇有效日常记录也获得10成长值，文字和录音合计只计一次，导入笔记不计分。
            </p>
            <p>
              每株植物消耗 {TREE_COST} 成长值，每站种满 4
              株，并从种下第一株起等待满72小时，才能解锁风景与配乐并前往下一站。每天最多获得20成长值，超出上限的记录仍保存但不计分，不会次日补发。
            </p>
            <p>
              同一条记录只奖励一次；编辑、重复保存和恢复版本不重复加分。删除源记录后，已经获得的成长与林木会保留。
            </p>
            <p className="march-muted">
              地图采用真实地形底图与历史节点坐标，连线概括历史行军走廊。风景 CG
              为各地风景的艺术演绎；树种取当地代表性植被，雪线以上与天然湿地不作不合理造林。
            </p>
            <button className="btn btn-primary march-primary" onClick={() => setRules(false)}>
              开始这一程
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
