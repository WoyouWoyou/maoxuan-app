import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Article } from '@shared/types'
import type { WbSourceArea } from '@shared/workbench'
import { WB_SOURCES } from '@shared/workbench'
import { ArticleReader } from '@renderer/components/ArticleReader'
import { toMessage } from './types'
import './SourceDrawer.css'

export interface SourceDrawerProps {
  area: WbSourceArea
  onClose: () => void
}

export function SourceDrawer({ area, onClose }: SourceDrawerProps) {
  const navigate = useNavigate()
  const entries = useMemo(() => WB_SOURCES.filter((s) => s.area === area), [area])

  const [index, setIndex] = useState(0)
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setIndex(0)
  }, [area])

  const safeIndex = entries.length > 0 ? Math.min(index, entries.length - 1) : -1
  const current = safeIndex >= 0 ? entries[safeIndex] : null
  const articleId = current ? current.articleId : null
  const quote = current ? current.quote : ''

  useEffect(() => {
    if (!articleId) {
      setArticle(null)
      setError('')
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError('')
    setArticle(null)
    window.api.articles
      .get(articleId)
      .then(a => {
        if (!alive) return
        setArticle(a)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(toMessage(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [articleId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const target = article && quote ? article.paragraphs.findIndex(p => p.includes(quote)) : -1

  return (
    <div className="wsd-mask" role="presentation" onClick={onClose}>
      <aside className="wsd" onClick={e => e.stopPropagation()}>
        <header className="wsd-head">
          <div className="wsd-title">原文依据</div>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!articleId}
            onClick={() => {
              if (!articleId) return
              onClose()
              navigate(`/library/${articleId}`)
            }}
          >
            在书库打开
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            关闭
          </button>
        </header>

        {entries.length > 0 ? (
          <div className="wsd-tabs">
            {entries.map((s, i) => (
              <button
                key={`${s.articleId}-${i}`}
                type="button"
                className={i === safeIndex ? 'wsd-tab is-on' : 'wsd-tab'}
                onClick={() => setIndex(i)}
              >
                <span className="wsd-tab-title">《{s.title}》</span>
                <span className="wsd-tab-use">{s.use}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="wsd-body scroll">
          {loading ? (
            <div className="empty">
              <span className="spinner" /> 正在加载原文…
            </div>
          ) : null}
          {error ? <div className="error-text wsd-error">{error}</div> : null}
          {entries.length === 0 ? <div className="empty">这里还没有配置原文依据。</div> : null}
          {!loading && !error && entries.length > 0 && !article ? <div className="empty">没有找到这篇文章。</div> : null}

          {!loading && !error && article ? (
            <>
              <div className="wsd-quote">
                {quote ? <p className="serif wsd-quote-text">{quote}</p> : null}
                {current && current.use ? <div className="wsd-quote-use">{current.use}</div> : null}
              </div>
              <ArticleReader
                article={article}
                compact
                scrollToParagraph={target >= 0 ? target : null}
                activeParagraph={target >= 0 ? target : null}
              />
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
