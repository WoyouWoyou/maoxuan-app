import { useEffect, useMemo, useRef } from 'react'
import type { Article, Passage } from '@shared/types'
import './ArticleReader.css'

export interface ArticleReaderProps {
  article: Article
  passages?: Passage[]
  focusQuestion?: string
  scrollToParagraph?: number | null
  compact?: boolean
  /** 提供后，段落编号变成可点击按钮（点击即关联 / 取消关联该段） */
  onParagraphClick?: (index: number) => void
  /** 当前“关联到感悟”的段落下标 */
  activeParagraph?: number | null
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function renderText(text: string) {
  return text.split(/(〔\d+〕)/g).map((part, i) =>
    /^〔\d+〕$/.test(part) ? (
      <sup key={i} className="reader-num">
        {part}
      </sup>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function ArticleReader({
  article,
  passages,
  focusQuestion,
  scrollToParagraph = null,
  compact = false,
  onParagraphClick,
  activeParagraph = null
}: ArticleReaderProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const marks = useMemo(() => {
    const map = new Map<number, Passage[]>()
    for (const p of passages ?? []) {
      const list = map.get(p.paragraphIndex)
      if (list) list.push(p)
      else map.set(p.paragraphIndex, [p])
    }
    return map
  }, [passages])

  const markList = useMemo(
    () => (passages ?? []).slice().sort((a, b) => a.paragraphIndex - b.paragraphIndex),
    [passages]
  )

  function jumpTo(idx: number) {
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('reader-flash')
    void el.offsetWidth
    el.classList.add('reader-flash')
    window.setTimeout(() => el.classList.remove('reader-flash'), 1600)
  }

  useEffect(() => {
    if (scrollToParagraph === null) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-idx="${scrollToParagraph}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('reader-flash')
    const timer = window.setTimeout(() => el.classList.remove('reader-flash'), 1600)
    return () => window.clearTimeout(timer)
  }, [scrollToParagraph, article.id])

  // 窄容器里不再用侧栏目录（否则正文会被挤成竖条），改为顶部标签条（见 CSS 容器查询）
  const showSide = !compact && markList.length > 0

  return (
    <div className={compact ? 'reader reader-compact' : 'reader'}>
      {markList.length > 0 ? (
        <nav className="reader-toc-strip" aria-label="标注段落">
          <span className="reader-toc-strip-label">标注段落</span>
          {markList.map((p, i) => (
            <button
              key={`${p.paragraphIndex}-${i}`}
              type="button"
              className="reader-toc-item"
              title={p.verified ? p.quote : `${p.quote}（未能逐字核对）`}
              onClick={() => jumpTo(p.paragraphIndex)}
            >
              第 {p.paragraphIndex + 1} 段
            </button>
          ))}
        </nav>
      ) : null}

      <div className={showSide ? 'reader-grid has-side' : 'reader-grid'}>
        <div className="reader-main">
          {focusQuestion ? (
            <div className="reader-focus">
              <div className="reader-focus-label">带着这个问题读</div>
              <p className="reader-focus-text">{focusQuestion}</p>
            </div>
          ) : null}

          {!compact ? (
            <header className="reader-head">
              <h1 className="reader-title serif">{article.title}</h1>
              <div className="reader-volume">{article.volume}</div>
            </header>
          ) : null}

          <div className="reader-body serif" ref={bodyRef}>
            {article.paragraphs.map((text, idx) => {
              const hits = marks.get(idx)
              const marked = hits !== undefined && hits.length > 0
              const active = activeParagraph === idx
              const classes = ['reader-p']
              if (marked) classes.push('reader-mark')
              if (active) classes.push('reader-active')
              return (
                <p key={idx} data-idx={idx} className={classes.join(' ')}>
                  {onParagraphClick ? (
                    <button
                      type="button"
                      className="reader-no reader-no-btn"
                      title="关联到感悟"
                      onClick={() => onParagraphClick(idx)}
                    >
                      {idx + 1}
                    </button>
                  ) : (
                    <span className="reader-no">{idx + 1}</span>
                  )}
                  <span className="reader-content">
                    <span className="reader-text">{renderText(text)}</span>
                    {marked && hits ? (
                      <span className="reader-why">
                        {hits.map((p, i) => (
                          <span className="reader-why-line" key={i}>
                            ◆ {p.why}
                            {p.verified ? null : <span className="reader-unverified">（未能逐字核对）</span>}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </p>
              )
            })}
          </div>

          {article.paragraphs.length === 0 ? <div className="empty">这篇文章没有正文内容。</div> : null}
        </div>

        {showSide ? (
          <aside className="reader-side">
            <div className="reader-side-title">标注目录</div>
            <div className="reader-side-list">
              {markList.map((p, i) => (
                <button key={i} className="reader-side-item" onClick={() => jumpTo(p.paragraphIndex)}>
                  <span className="reader-side-no">第 {p.paragraphIndex + 1} 段</span>
                  <span className="reader-side-quote">{clip(p.quote, 36)}</span>
                  {p.verified ? null : <span className="reader-unverified">（未能逐字核对）</span>}
                </button>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
