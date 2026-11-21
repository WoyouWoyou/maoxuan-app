import { marchStory } from '@shared/long-march-stories'
import { storyResources } from './story-assets'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LockSimple } from '@phosphor-icons/react'
import { MARCH_NODES, type MarchProgress } from '@shared/long-march'
import { landscapeFor } from './assets'
import { landscapeInfo } from './landscape-catalog'
import { grown, sceneTitle } from './presentation'
export function MarchAlbum({ progress }: { progress: MarchProgress }) {
  const navigate = useNavigate()
  return (
    <section className="march-page">
      <button className="march-text-button" onClick={() => navigate('/long-march')}>
        <ArrowLeft /> 返回长征地图
      </button>
      <header className="march-header">
        <div>
          <span className="march-kicker">山河留影</span>
          <h1>沿途的风景</h1>
          <p>每一站成林，便留下一幅属于这一程的山河。</p>
        </div>
        <span className="march-muted">
          已收藏 {progress.collected.length} / {MARCH_NODES.length}
        </span>
      </header>
      <div className="march-album">
        {MARCH_NODES.map((n) => (
          <button
            className="march-album-item"
            key={n.id}
            onClick={() =>
              navigate(grown(progress, n) ? `/long-march/${n.id}/scenery` : `/long-march/${n.id}`)
            }
          >
            {grown(progress, n) ? (
              <img src={landscapeFor(n)} alt={landscapeInfo(n).description} />
            ) : (
              <div className="march-album-locked">
                <img src={storyResources(n.id).image} alt={marchStory(n.id).illustration} />
                <span>
                  <LockSimple size={17} /> 故事封面 · 风景待解锁
                </span>
              </div>
            )}
            <span>
              <strong>
                {n.name} · {sceneTitle(n)}
              </strong>
              <small>
                {progress.collected.includes(n.id)
                  ? '已收藏'
                  : grown(progress, n)
                    ? '已解锁 · 点击欣赏'
                    : `${progress.plants[n.id] ?? 0} / ${n.target}`}
              </small>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
