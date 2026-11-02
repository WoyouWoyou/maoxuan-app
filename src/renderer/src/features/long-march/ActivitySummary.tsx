import { BookOpen, Notebook, Footprints, Plant } from '@phosphor-icons/react'
import type { MarchProgress } from '@shared/long-march'
export function ActivitySummary({ progress }: { progress: MarchProgress }) {
  return (
    <div className="march-stats">
      <div>
        <BookOpen />
        <span>
          完成阅读
          <strong>
            {progress.counts.reading}
            <small>次</small>
          </strong>
        </span>
      </div>
      <div>
        <Notebook />
        <span>
          思考记录
          <strong>
            {progress.counts.reflection}
            <small>篇</small>
          </strong>
        </span>
      </div>
      <div>
        <Footprints />
        <span>
          行动记录
          <strong>
            {progress.counts.action}
            <small>条</small>
          </strong>
        </span>
      </div>
      <div>
        <Notebook />
        <span>
          日常记录
          <strong>
            {progress.counts.journal ?? 0}
            <small>篇</small>
          </strong>
        </span>
      </div>
      <div>
        <Plant />
        <span>
          可用成长值<strong>{progress.balance}</strong>
        </span>
      </div>
      <p>
        把每一次思考，
        <br />
        种成沿途的风景。
      </p>
    </div>
  )
}
