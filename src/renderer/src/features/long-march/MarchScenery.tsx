import { landscapeInfo } from './landscape-catalog'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CaretDown, CaretUp } from '@phosphor-icons/react'
import type { MarchNode, MarchProgress } from '@shared/long-march'
import { landscapeFor } from './assets'
import { sceneTitle } from './presentation'
import { MusicPlayer } from './MusicPlayer'
import { useSceneryPanel } from './useSceneryPanel'
export function MarchScenery({
  node,
  progress,
  busy,
  feedback,
  collect
}: {
  node: MarchNode
  progress: MarchProgress
  busy: boolean
  feedback: ReactNode
  collect(nodeId: string): Promise<void>
}) {
  const navigate = useNavigate()
  const controls = useSceneryPanel(node.id)
  const count = progress.plants[node.id] ?? 0
  return (
    <section className="march-scenery">
      <img
        className="march-scenery-image"
        src={landscapeFor(node)}
        alt={landscapeInfo(node).description}
      />
      <button className="march-scenery-back" onClick={() => navigate('/long-march')}>
        <ArrowLeft /> 返回长征地图
      </button>
      <span className="march-art-note">当地风景艺术演绎</span>
      <div className="march-scenery-title">
        <span className="march-seal">{progress.completed ? '全程达成' : '本站成林'}</span>
        <h1>{progress.completed ? '山河已绿，征途有声' : '你种下的，已成为风景'}</h1>
        <p>
          {node.name} ·「{sceneTitle(node)}」已解锁
        </p>
      </div>
      <button
        ref={controls.toggle}
        className="march-panel-toggle"
        hidden={!controls.collapsed}
        aria-expanded={!controls.collapsed}
        aria-controls="march-scenery-controls"
        onClick={controls.expand}
      >
        <CaretUp size={18} /> 音乐与收藏
      </button>
      <div
        id="march-scenery-controls"
        ref={controls.panel}
        className={`march-scenery-footer${controls.collapsed ? ' is-collapsed' : ''}`}
        inert={controls.collapsed}
        aria-hidden={controls.collapsed}
        onPointerMove={controls.restartTimer}
        onPointerDown={controls.clearTimer}
        onPointerUp={controls.restartTimer}
        onPointerCancel={controls.restartTimer}
        onFocusCapture={controls.restartTimer}
        onKeyDownCapture={controls.restartTimer}
      >
        <button
          className="march-panel-collapse"
          aria-label="收起音乐与收藏面板"
          onClick={controls.collapse}
        >
          <CaretDown size={18} />
        </button>
        {feedback}
        <div className="march-reward-row">
          <div className="march-reward-name">
            <img src={landscapeFor(node)} alt="" />
            <div>
              <h2>{sceneTitle(node)}</h2>
              <p>
                {node.name} · {count} 株{node.plant}
              </p>
            </div>
          </div>
          <MusicPlayer key={node.id} autoStart />
          <div className="march-reward-actions">
            <button
              className="btn btn-primary"
              disabled={busy || progress.collected.includes(node.id)}
              onClick={() => void collect(node.id)}
            >
              {progress.collected.includes(node.id) ? (
                <>
                  <Check /> 已收入画册
                </>
              ) : (
                <>
                  收藏这幅风景 <ArrowRight />
                </>
              )}
            </button>
            <button className="march-text-button" onClick={() => navigate('/long-march/album')}>
              查看风景画册
            </button>
          </div>
        </div>
        <p className="march-reward-motto">你的每一份记录，都在这里生根。</p>
      </div>
    </section>
  )
}
