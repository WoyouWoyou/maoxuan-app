import { useMemo, useState } from 'react'
import type { ArticleMeta } from '@shared/types'
import { buildToc, type TocNode } from './toc'

export function BookToc({
  chapters,
  onSelect
}: {
  chapters: ArticleMeta[]
  onSelect: (id: string) => void
}) {
  const nodes = useMemo(() => buildToc(chapters), [chapters])
  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  const defaultOpen = new Set<string>()
  let first = nodes[0]
  while (first?.kind === 'group') {
    defaultOpen.add(first.id)
    first = first.children[0]
  }
  const open = expanded ?? defaultOpen
  const groupIds: string[] = []
  function collect(list: TocNode[]) {
    for (const node of list)
      if (node.kind === 'group') {
        groupIds.push(node.id)
        collect(node.children)
      }
  }
  collect(nodes)
  function render(list: TocNode[]) {
    return list.map((node) =>
      node.kind === 'chapter' ? (
        <li key={node.article.id}>
          <button className="lib-toc-item" onClick={() => onSelect(node.article.id)}>
            <span className="lib-toc-index">{node.number}</span>
            <span className="lib-toc-label">{node.article.title}</span>
          </button>
        </li>
      ) : (
        <li className="lib-vol" key={node.id}>
          <button
            className="lib-vol-head"
            aria-expanded={open.has(node.id)}
            onClick={() => {
              const next = new Set(open)
              if (next.has(node.id)) next.delete(node.id)
              else next.add(node.id)
              setExpanded(next)
            }}
          >
            <span className="lib-vol-caret" aria-hidden="true">
              {open.has(node.id) ? '▾' : '▸'}
            </span>
            <span className="lib-vol-name">{node.title}</span>
            <span className="lib-vol-count">{node.count} 篇</span>
          </button>
          {open.has(node.id) && <ol className="lib-toc">{render(node.children)}</ol>}
        </li>
      )
    )
  }
  return (
    <nav aria-label="本书目录">
      <div className="book-toolbar book-toc-toolbar">
        <span className="muted">目录 · {chapters.length} 篇</span>
        {groupIds.length > 0 && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(new Set(groupIds))}>
              全部展开
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(new Set())}>
              全部收起
            </button>
          </>
        )}
      </div>
      <ol className="book-toc-root">{render(nodes)}</ol>
    </nav>
  )
}
