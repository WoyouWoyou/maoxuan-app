import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'

/** 只折叠呈现，始终保留完整原文；按实际溢出显示展开入口。 */
export function ThinkingText({
  text,
  lines = 2,
  label = '内容',
  className = ''
}: {
  text: string
  lines?: number
  label?: string
  className?: string
}) {
  const id = useId()
  const content = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = content.current
    if (!el || expanded) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, lines, expanded])

  return (
    <div className={`wbt-fold-text ${className}`}>
      <div
        id={id}
        ref={content}
        className={expanded ? 'wbt-text-content is-expanded' : 'wbt-text-content'}
        style={{ '--wbt-lines': lines } as CSSProperties}
      >
        {text}
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          className="wbt-text-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={`${expanded ? '收起' : '展开'}${label}全文`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起' : '展开全文'}
          {expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
        </button>
      )}
    </div>
  )
}
