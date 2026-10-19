import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Article, ArticleMeta, Reading, Reflection, SearchHit } from '@shared/types'
import { CORE_ARTICLES } from '@shared/core'
import { ArticleReader } from '@renderer/components/ArticleReader'
import { ReflectionPanel } from '@renderer/components/ReflectionPanel'
import type { StepProps } from './types'
import './steps.css'

function makeReading(articleId: string, title: string, focusQuestion = ''): Reading {
  return {
    articleId,
    title,
    startedAt: new Date().toISOString(),
    focusQuestion,
    passages: [],
    reflections: [],
    readDone: false,
    notes: { coreMethod: '', relatedProblem: '', action: '' },
    feedback: null,
    notesDone: false
  }
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function StepFocus({
  session,
  goStep,
  update,
  focusArticleId,
  setFocusArticleId,
  scrollToParagraph
}: StepProps) {
  const [article, setArticle] = useState<Article | null>(null)
  const [loadingArticle, setLoadingArticle] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null)
  const [jumpTo, setJumpTo] = useState<number | null>(null)
  const [panelHeight, setPanelHeight] = useState(260)
  const [panelCollapsed, setPanelCollapsed] = useState(false)

  const data = session.data
  const generic = data.book?.profile === 'generic'
  const [catalog, setCatalog] = useState<ArticleMeta[]>([])
  useEffect(() => {
    let alive = true
    void window.api.articles
      .list(data.book)
      .then((list) => {
        if (alive) setCatalog(list)
      })
      .catch((e) => setErr(toMessage(e)))
    return () => {
      alive = false
    }
  }, [data.book?.revisionId])
  const recommendations = data.diagnosis?.recommendations ?? []
  const readings = data.readings
  const reading = readings.find((r) => r.articleId === focusArticleId) ?? null
  const extraReadings = readings.filter(
    (r) => !CORE_ARTICLES.some((c) => c.articleId === r.articleId)
  )

  async function select(articleId: string, title?: string, focusQuestion = '') {
    setFocusArticleId(articleId)
    if (readings.some((r) => r.articleId === articleId)) return
    let finalTitle = title ?? ''
    if (!finalTitle) {
      const loaded = await window.api.articles.get(articleId, data.book)
      finalTitle = loaded?.title ?? articleId
    }
    await update((latest) => {
      if (latest.readings.some((r) => r.articleId === articleId)) return latest
      return {
        ...latest,
        readings: [...latest.readings, makeReading(articleId, finalTitle, focusQuestion)]
      }
    })
  }

  // 进入第二步时默认选中一篇文章
  useEffect(() => {
    if (focusArticleId) return
    const first = readings[0]?.articleId
    if (first) {
      setFocusArticleId(first)
      return
    }
    const rec = recommendations[0]
    if (rec) {
      void select(rec.articleId, rec.title, rec.focusQuestion)
      return
    }
    if (!generic) void select(CORE_ARTICLES[0].articleId, CORE_ARTICLES[0].title)
    // 仅在挂载时决定默认篇目
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!focusArticleId) {
      setArticle(null)
      return
    }
    let alive = true
    setLoadingArticle(true)
    window.api.articles
      .get(focusArticleId, data.book)
      .then((loaded) => {
        if (!alive) return
        setArticle(loaded)
        setLoadingArticle(false)
      })
      .catch(() => {
        if (!alive) return
        setArticle(null)
        setLoadingArticle(false)
      })
    return () => {
      alive = false
    }
  }, [focusArticleId])

  // 换文章时清空关联段落
  useEffect(() => {
    setActiveParagraph(null)
    setJumpTo(null)
  }, [focusArticleId])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      window.api.articles
        .search(q, 20, data.book)
        .then((results) => {
          setHits(results)
          setSearching(false)
        })
        .catch(() => {
          setHits([])
          setSearching(false)
        })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  async function findPassages() {
    if (!reading || busy) return
    const articleId = reading.articleId
    const title = reading.title
    setBusy(true)
    setErr('')
    try {
      const result = await window.api.ai.findPassages(session.id, articleId)
      await update(
        (latest) => ({
          ...latest,
          readings: latest.readings.map((r) =>
            r.articleId === articleId
              ? {
                  ...r,
                  focusQuestion: result.focusQuestion || r.focusQuestion,
                  passages: result.passages
                }
              : r
          )
        }),
        { versionLabel: `第二步：为《${title}》标注段落` }
      )
    } catch (e) {
      setErr(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function markReadDone() {
    if (!reading) return
    const articleId = reading.articleId
    const title = reading.title
    await update(
      (latest) => ({
        ...latest,
        readings: latest.readings.map((r) =>
          r.articleId === articleId ? { ...r, readDone: true } : r
        )
      }),
      { versionLabel: `第二步：精读《${title}》`, step: 'relate' }
    )
    goStep('relate')
  }

  async function addReflection(record: Reflection) {
    const articleId = reading?.articleId
    if (!articleId) return
    await update((latest) => ({
      ...latest,
      readings: latest.readings.map((r) =>
        r.articleId === articleId ? { ...r, reflections: [...(r.reflections ?? []), record] } : r
      )
    }))
  }

  async function removeReflection(id: string) {
    const articleId = reading?.articleId
    if (!articleId) return
    await update((latest) => ({
      ...latest,
      readings: latest.readings.map((r) =>
        r.articleId === articleId
          ? { ...r, reflections: (r.reflections ?? []).filter((item) => item.id !== id) }
          : r
      )
    }))
  }

  function toggleParagraph(index: number) {
    setActiveParagraph((prev) => (prev === index ? null : index))
  }

  // 先置 null 再设值，保证连续点击同一段也能重新滚动
  function jumpToParagraph(index: number) {
    setActiveParagraph(index)
    setJumpTo(null)
    window.setTimeout(() => setJumpTo(index), 0)
  }

  function startDrag(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelHeight
    setPanelCollapsed(false)
    function onMove(ev: MouseEvent) {
      const next = Math.min(480, Math.max(160, startH - (ev.clientY - startY)))
      setPanelHeight(next)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const recommendedIds = recommendations.map((r) => r.articleId)
  const restCore = (
    generic
      ? catalog.map((c) => ({ articleId: c.id, title: c.title, solves: c.volume }))
      : CORE_ARTICLES
  ).filter((c) => !recommendedIds.includes(c.articleId))
  const scrollTarget = jumpTo ?? scrollToParagraph

  return (
    <div className="step-focus">
      <aside className="step-focus-list scroll">
        {recommendations.length > 0 && (
          <div className="step-focus-group">
            <div className="step-focus-group-title">教练推荐</div>
            {recommendations.map((rec) => (
              <button
                key={rec.articleId}
                type="button"
                className={`step-focus-item${focusArticleId === rec.articleId ? ' is-active' : ''}`}
                title={rec.reason}
                onClick={() => void select(rec.articleId, rec.title, rec.focusQuestion)}
              >
                <span className="step-focus-item-head">
                  <span className="step-focus-item-title">{rec.title}</span>
                  <span className="badge badge-red">推荐</span>
                </span>
                <span className="step-focus-item-sub">{rec.reason}</span>
              </button>
            ))}
          </div>
        )}

        <div className="step-focus-group">
          <div className="step-focus-group-title">
            {generic ? '本书目录（也可自行选择）' : '核心五篇'}
          </div>
          {restCore.map((core) => (
            <button
              key={core.articleId}
              type="button"
              className={`step-focus-item${focusArticleId === core.articleId ? ' is-active' : ''}`}
              title={core.solves}
              onClick={() => void select(core.articleId, core.title)}
            >
              <span className="step-focus-item-head">
                <span className="step-focus-item-title">{core.title}</span>
              </span>
              <span className="step-focus-item-sub">{core.solves}</span>
            </button>
          ))}
        </div>

        {extraReadings.length > 0 && (
          <div className="step-focus-group">
            <div className="step-focus-group-title">已加入的篇目</div>
            {extraReadings.map((item) => (
              <button
                key={item.articleId}
                type="button"
                className={`step-focus-item${focusArticleId === item.articleId ? ' is-active' : ''}`}
                onClick={() => setFocusArticleId(item.articleId)}
              >
                <span className="step-focus-item-head">
                  <span className="step-focus-item-title">{item.title}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="step-focus-group">
          <div className="step-focus-group-title">从全书搜索</div>
          <input
            className="input"
            value={query}
            placeholder="如：调查研究 / 群众路线"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && (
            <div className="muted step-focus-search-tip">
              <span className="spinner" /> 搜索中…
            </div>
          )}
          {!searching && query.trim().length > 0 && hits.length === 0 && (
            <div className="muted step-focus-search-tip">没有找到相关文章</div>
          )}
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              className={`step-focus-item${focusArticleId === hit.id ? ' is-active' : ''}`}
              title={hit.volume}
              onClick={() => void select(hit.id, hit.title)}
            >
              <span className="step-focus-item-head">
                <span className="step-focus-item-title">{hit.title}</span>
              </span>
              <span className="step-focus-item-sub">{hit.snippet}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="step-focus-main">
        <div className="step-focus-toolbar">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !reading}
            onClick={() => void findPassages()}
          >
            {busy && <span className="spinner" />}{' '}
            {reading && reading.passages.length > 0 ? '重新标注' : '帮我找到该读的段落'}
          </button>
          <span className="muted">只看原文，不看解读。慢一点没关系。</span>
          <span className="spacer" />
          {reading?.readDone ? (
            <span className="badge badge-ok">已读完</span>
          ) : (
            <span className="badge">未读完</span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!reading}
            onClick={() => void markReadDone()}
          >
            我读完了，去写 3 条笔记
          </button>
        </div>

        {err && <div className="error-text">{err}</div>}

        <div className="step-focus-reader scroll">
          {loadingArticle && (
            <div className="empty">
              <span className="spinner" /> 正在加载原文…
            </div>
          )}
          {!loadingArticle && !article && <div className="empty">在左侧选择一篇文章</div>}
          {article && (
            <ArticleReader
              article={article}
              passages={reading?.passages ?? []}
              focusQuestion={reading?.focusQuestion || undefined}
              scrollToParagraph={scrollTarget}
              compact
              onParagraphClick={toggleParagraph}
              activeParagraph={activeParagraph}
            />
          )}
        </div>

        {article && reading && (
          <>
            <div className="step-focus-splitter">
              <div
                className="step-focus-splitter-bar"
                title="拖动调整感悟框高度"
                onMouseDown={startDrag}
              />
              <button
                type="button"
                className="step-focus-splitter-btn"
                onClick={() => setPanelCollapsed((v) => !v)}
              >
                {panelCollapsed ? '展开感悟框' : '收起感悟框'}
              </button>
            </div>
            <div
              className={panelCollapsed ? 'step-focus-refl is-collapsed' : 'step-focus-refl'}
              style={panelCollapsed ? undefined : { height: panelHeight }}
            >
              <ReflectionPanel
                article={article}
                reflections={reading.reflections ?? []}
                activeParagraph={activeParagraph}
                onClearParagraph={() => setActiveParagraph(null)}
                onAdd={addReflection}
                onRemove={removeReflection}
                onJump={jumpToParagraph}
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
