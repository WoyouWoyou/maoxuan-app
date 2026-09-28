import { useEffect, useState } from 'react'
import { FOUR_DONTS } from '@shared/core'

export function DontsTicker() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex(prev => (prev + 1) % FOUR_DONTS.length)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [])

  const current = FOUR_DONTS[index]

  return (
    <div className="donts">
      <span className="donts-label">四不要</span>
      <button
        type="button"
        className="donts-arrow"
        aria-label="上一条"
        onClick={() => setIndex(prev => (prev - 1 + FOUR_DONTS.length) % FOUR_DONTS.length)}
      >
        ‹
      </button>
      <span className="donts-text">
        <b>{current.title}</b>
        {current.detail}
      </span>
      <button
        type="button"
        className="donts-arrow"
        aria-label="下一条"
        onClick={() => setIndex(prev => (prev + 1) % FOUR_DONTS.length)}
      >
        ›
      </button>
      <span className="donts-dots">
        {FOUR_DONTS.map((dot, i) => (
          <i key={dot.title} className={i === index ? 'on' : ''} />
        ))}
      </span>
    </div>
  )
}
