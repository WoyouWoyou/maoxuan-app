import type { ArticleMeta } from '@shared/types'

export type TocNode = TocGroup | TocChapter
export interface TocGroup {
  kind: 'group'
  id: string
  title: string
  count: number
  children: TocNode[]
}
export interface TocChapter {
  kind: 'chapter'
  article: ArticleMeta
  number: number
}

// The parser supplies parent paths; titles and source IDs remain untouched.
export function buildToc(chapters: ArticleMeta[]): TocNode[] {
  const roots: TocNode[] = []
  const groups = new Map<string, TocGroup>()
  chapters.forEach((article, index) => {
    const path = article.volume
      .split(' / ')
      .map((s) => s.trim())
      .filter(Boolean)
    let children = roots
    path.forEach((title, depth) => {
      const id = JSON.stringify(path.slice(0, depth + 1))
      let group = groups.get(id)
      if (!group) {
        group = { kind: 'group', id, title, count: 0, children: [] }
        groups.set(id, group)
        children.push(group)
      }
      group.count++
      children = group.children
    })
    children.push({ kind: 'chapter', article, number: index + 1 })
  })
  // A parser fallback is not a meaningful extra navigation level.
  return roots.length === 1 && roots[0].kind === 'group' && roots[0].title === '正文'
    ? roots[0].children
    : roots
}
