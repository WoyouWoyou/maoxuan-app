import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CORE_ARTICLES } from '@shared/core'
import type { ArticleMeta, SearchHit } from '@shared/types'
import './LibraryPage.css'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function renderSnippet(snippet: string) {
  return snippet.split(/(【[^】]*】)/g).map((part, i) =>
    part.length > 2 && part.startsWith('【') && part.endsWith('】') ? (
      <mark key={i} className="lib-mark">
        {part.slice(1, -1)}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function LibraryPage() {
  const navigate = useNavigate()

  const [articles, setArticles] = useState<ArticleMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState('')

  const [openVolumes, setOpenVolumes] = useState<Record<string, boolean>>({})
  const [volumesInited, setVolumesInited] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.articles
      .list()
      .then((list) => {
        if (!alive) return
        setArticles(list)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setLoadError(errText(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const volumes = useMemo(() => {
    const map = new Map<string, ArticleMeta[]>()
    for (const a of articles) {
      const list = map.get(a.volume)
      if (list) list.push(a)
      else map.set(a.volume, [a])
    }
    return Array.from(map.entries())
  }, [articles])

  useEffect(() => {
    if (volumesInited || volumes.length === 0) return
    setOpenVolumes({ [volumes[0][0]]: true })
    setVolumesInited(true)
  }, [volumes, volumesInited])

  useEffect(() => {
    const q = query.trim()
    if (q.length === 0) {
      setHits([])
      setSearching(false)
      setSearchError(null)
      setSearched('')
      return
    }
    setSearching(true)
    let alive = true
    const timer = window.setTimeout(() => {
      window.api.articles
        .search(q)
        .then((res) => {
          if (!alive) return
          setHits(res)
          setSearched(q)
          setSearching(false)
        })
        .catch((e: unknown) => {
          if (!alive) return
          setSearchError(errText(e))
          setSearching(false)
        })
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query])

  const searchingNow = query.trim().length > 0

  return (
    <div className="lib">
      <header className="lib-head">
        <h1 className="lib-title">原文书库</h1>
        <div className="lib-search">
          <input
            className="input"
            value={query}
            placeholder="搜索原文标题或正文（输入任意关键词）"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching ? <span className="spinner" /> : null}
        </div>
      </header>

      {loadError ? <div className="error-text">{loadError}</div> : null}
      {searchError ? <div className="error-text">{searchError}</div> : null}

      {searchingNow ? (
        <section className="lib-results">
          <div className="lib-results-head muted">
            {searching ? '正在检索…' : `“${searched}” 共 ${hits.length} 条结果`}
          </div>
          {!searching && hits.length === 0 ? <div className="empty">没有找到相关原文，换个说法再试。</div> : null}
          {hits.map((h) => (
            <button key={h.id} className="lib-hit" onClick={() => navigate(`/library/${h.id}`)}>
              <span className="lib-hit-title">
                {h.title}
                <span className="lib-hit-vol">{h.volume}</span>
              </span>
              <span className="lib-hit-snippet">{renderSnippet(h.snippet)}</span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <section className="lib-section">
            <h2 className="lib-h2">核心五篇</h2>
            <p className="lib-section-note muted">先读这五篇；大部分其他篇目与你当下的问题无关。</p>
            <div className="lib-core-grid">
              {CORE_ARTICLES.map((a) => (
                <button
                  key={a.articleId}
                  className="card lib-core-card"
                  onClick={() => navigate(`/library/${a.articleId}`)}
                >
                  <span className="lib-core-title">{a.title}</span>
                  <span className="lib-core-solves muted">解决：{a.solves}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="lib-section">
            <h2 className="lib-h2">全书目录</h2>
            <p className="lib-section-note muted">
              {loading ? '正在加载…' : `共 ${articles.length} 篇`}
            </p>
            {volumes.map(([vol, list]) => {
              const open = !!openVolumes[vol]
              return (
                <div className="lib-vol" key={vol}>
                  <button
                    className="lib-vol-head"
                    onClick={() => setOpenVolumes((prev) => ({ ...prev, [vol]: !open }))}
                  >
                    <span className="lib-vol-caret">{open ? '▾' : '▸'}</span>
                    <span className="serif lib-vol-name">{vol}</span>
                    <span className="spacer" />
                    <span className="lib-vol-count">{list.length} 篇</span>
                  </button>
                  {open ? (
                    <ul className="lib-toc">
                      {list.map((a, i) => (
                        <li key={a.id}>
                          <button className="lib-toc-item" onClick={() => navigate(`/library/${a.id}`)}>
                            <span className="lib-toc-index">{i + 1}</span>
                            <span className="lib-toc-title">{a.title}</span>
                            {a.isCore ? <span className="badge badge-red">核心</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}
