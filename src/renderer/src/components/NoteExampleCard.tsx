import { useEffect, useState } from 'react'
import { CORE_EXAMPLES, exampleFor } from '@shared/core'
import './NoteExampleCard.css'

interface NoteExampleCardProps {
  articleId: string | null
}

export function NoteExampleCard({ articleId }: NoteExampleCardProps) {
  const [activeId, setActiveId] = useState<string>(() => exampleFor(articleId).articleId)

  useEffect(() => {
    setActiveId(exampleFor(articleId).articleId)
  }, [articleId])

  const example = CORE_EXAMPLES.find(e => e.articleId === activeId) ?? exampleFor(articleId)
  const isCore = articleId !== null && CORE_EXAMPLES.some(e => e.articleId === articleId)

  return (
    <details className="card nex-card">
      <summary>▸ 示例：读完《{example.title}》</summary>

      <div className="nex-body">
        {!isCore && <div className="nex-hint">这篇不是核心五篇，先参考最接近的示例</div>}

        <div className="nex-tabs">
          {CORE_EXAMPLES.map(e => (
            <button
              key={e.articleId}
              type="button"
              className={`nex-tab${e.articleId === example.articleId ? ' is-on' : ''}`}
              onClick={() => setActiveId(e.articleId)}
            >
              {e.title}
            </button>
          ))}
        </div>

        <div className="nex-subtitle">《{example.title}》的核心方法</div>
        <ul className="nex-methods">
          {example.methods.map(m => (
            <li key={m}>
              <span className="nex-dot">◆</span>
              {m}
            </li>
          ))}
        </ul>

        <p className="nex-wrong">
          <s>错误示范：{example.wrong}</s>
        </p>
        <p className="nex-line">
          <b>1. 核心方法：</b>
          {example.coreMethod}
        </p>
        <p className="nex-line">
          <b>2. 关联问题：</b>
          {example.relatedProblem}
        </p>
        <p className="nex-line">
          <b>3. 具体行动：</b>
          {example.action}
        </p>

        <div className="nex-foot">示例只是示范写法，你的 3 条要写你自己的事。</div>
      </div>
    </details>
  )
}
