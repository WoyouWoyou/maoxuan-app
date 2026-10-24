import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  SlidersHorizontalIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  BookOpenIcon
} from '@phosphor-icons/react'
import { ReaderOptions } from '../features/reader/ReaderOptions'
import { useReaderPreferences } from '../features/reader/preferences'
import { useSpeechPlayer } from '../features/reader/useSpeechPlayer'
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
  const optionsRef = useRef<HTMLDivElement | null>(null)
  const optionsButtonRef = useRef<HTMLButtonElement | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [playerPosition, setPlayerPosition] = useState<{ top: number; left: number } | undefined>()
  const { preferences, loaded } = useReaderPreferences()
  const player = useSpeechPlayer(article.id, article.paragraphs, preferences)
  const playing = ['loading', 'playing', 'paused', 'error'].includes(player.status)
  useEffect(() => {
    if (!playing || player.status === 'error') {
      setPlayerPosition(undefined)
      return
    }
    const position = () => {
      const bounds = bodyRef.current
        ?.querySelector(`[data-idx="${player.index}"]`)
        ?.getBoundingClientRect()
      const panel = optionsOpen ? optionsRef.current?.getBoundingClientRect() : undefined
      if (panel && bounds && panel.left - bounds.right < 254) {
        setPlayerPosition({ top: window.innerHeight - 76, left: Math.max(20, panel.left - 250) })
        return
      }
      if (
        !bounds ||
        window.innerWidth - bounds.right < 254 ||
        bounds.bottom < 100 ||
        bounds.top > window.innerHeight - 60
      ) {
        setPlayerPosition(undefined)
        return
      }
      setPlayerPosition({
        top: Math.max(86, Math.min(bounds.top + 20, window.innerHeight - 80)),
        left: bounds.right + 16
      })
    }
    position()
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [playing, player.index, player.status, preferences.layout, optionsOpen])
  function closeOptions() {
    optionsRef.current?.hidePopover()
    optionsButtonRef.current?.focus()
  }
  useEffect(() => {
    if (player.index < 0 || !preferences.follow || player.status !== 'playing') return
    bodyRef.current
      ?.querySelector(`[data-idx="${player.index}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [player.index, player.status, preferences.follow])

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
    <div
      className={`reader reader-layout-${preferences.layout}${compact ? ' reader-compact' : ''}`}
    >
      <div className="reader-tools">
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
        <div className="reader-tool-actions">
          {player.status === 'done' && (
            <span role="status" className="reader-complete">
              朗读完成
            </span>
          )}
          {preferences.enabled && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!loaded || !article.paragraphs.length}
              onClick={() => void player.start()}
            >
              <PlayIcon size={15} />
              朗读全文
            </button>
          )}
          <button
            ref={optionsButtonRef}
            type="button"
            className={`btn btn-ghost btn-sm${optionsOpen ? ' is-open' : ''}`}
            aria-expanded={optionsOpen}
            aria-haspopup="dialog"
            onClick={() => optionsRef.current?.togglePopover()}
          >
            <SlidersHorizontalIcon size={16} />
            阅读选项
          </button>
        </div>
      </div>
      <div
        ref={optionsRef}
        popover="auto"
        role="dialog"
        aria-label="阅读选项"
        className="reader-options-popover"
        onToggle={(event) => setOptionsOpen(event.newState === 'open')}
      >
        <ReaderOptions
          onClose={closeOptions}
          canRead={article.paragraphs.length > 0}
          onRead={() => {
            closeOptions()
            void player.start()
          }}
        />
      </div>
      {playing &&
        createPortal(
          <div
            className="reader-playback"
            style={
              playerPosition ? { ...playerPosition, bottom: 'auto', right: 'auto' } : undefined
            }
            role="region"
            aria-label="朗读控制"
          >
            {player.status === 'error' ? (
              <>
                <span role="alert" className="reader-playback-error">
                  {player.error}
                </span>
                <button type="button" onClick={() => void player.retry()}>
                  重试
                </button>
                <button type="button" onClick={() => optionsRef.current?.showPopover()}>
                  语音设置
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="reader-play-pause"
                  aria-label={player.status === 'paused' ? '继续朗读' : '暂停朗读'}
                  onClick={player.togglePause}
                >
                  {player.status === 'paused' ? (
                    <PlayIcon weight="fill" size={18} />
                  ) : (
                    <PauseIcon weight="fill" size={18} />
                  )}
                </button>
                <span className="reader-playback-progress" role="status">
                  {player.status === 'loading'
                    ? '正在合成 · '
                    : player.status === 'paused'
                      ? '已暂停 · '
                      : ''}
                  第 {player.index + 1} / {article.paragraphs.length} 段
                </span>
                {player.cacheProgress.total > 0 && (
                  <span
                    className="reader-cache-progress"
                    title={
                      player.cacheProgress.failed
                        ? '部分片段预生成失败，播放到该处时会重试'
                        : '已准备好的音频保存在本地，再次播放优先使用缓存'
                    }
                  >
                    本地缓存 {player.cacheProgress.ready}/{player.cacheProgress.total}
                  </span>
                )}
              </>
            )}
            <button
              type="button"
              className="reader-stop"
              aria-label="停止朗读"
              onClick={player.stop}
            >
              <StopIcon weight="fill" size={16} />
            </button>
          </div>,
          document.body
        )}

      {focusQuestion ? (
        <div className="reader-focus">
          <div className="reader-focus-label">带着这个问题读</div>
          <p className="reader-focus-text">{focusQuestion}</p>
        </div>
      ) : null}

      <div className={showSide ? 'reader-grid has-side' : 'reader-grid'}>
        <div className="reader-main">
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
              if (player.index === idx && playing) classes.push('reader-speaking')
              return (
                <p
                  key={idx}
                  data-idx={idx}
                  className={classes.join(' ')}
                  aria-current={player.index === idx && playing ? 'true' : undefined}
                >
                  {preferences.enabled && (
                    <span className="reader-paragraph-actions">
                      <button
                        type="button"
                        aria-label={`只读第 ${idx + 1} 段`}
                        onClick={() => void player.start(idx, true)}
                      >
                        <BookOpenIcon size={14} />
                        只读本段
                      </button>
                      <button
                        type="button"
                        aria-label={`从第 ${idx + 1} 段开始读`}
                        onClick={() => void player.start(idx)}
                      >
                        <PlayIcon size={14} weight="fill" />
                        从这里读
                      </button>
                    </span>
                  )}
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
                            {p.verified ? null : (
                              <span className="reader-unverified">（未能逐字核对）</span>
                            )}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </p>
              )
            })}
          </div>

          {article.paragraphs.length === 0 ? (
            <div className="empty">这篇文章没有正文内容。</div>
          ) : null}
        </div>

        {showSide ? (
          <aside className="reader-side">
            <div className="reader-side-title">标注目录</div>
            <div className="reader-side-list">
              {markList.map((p, i) => (
                <button
                  key={i}
                  className="reader-side-item"
                  onClick={() => jumpTo(p.paragraphIndex)}
                >
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
