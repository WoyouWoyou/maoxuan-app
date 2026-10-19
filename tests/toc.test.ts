import { describe, expect, it } from 'vitest'
import { buildToc } from '../src/renderer/src/features/library/toc'
import type { ArticleMeta } from '../src/shared/types'
const chapter = (id: string, volume: string): ArticleMeta => ({
  id,
  volume,
  title: `篇章 ${id}`,
  isCore: false,
  coreOrder: null,
  length: 10
})
describe('original book table of contents', () => {
  it('retains volume order, chapter order and source IDs', () => {
    const nodes = buildToc([chapter('b', '第二卷'), chapter('a', '第二卷'), chapter('c', '第一卷')])
    expect(nodes.map((n) => n.kind === 'group' && [n.title, n.count])).toEqual([
      ['第二卷', 2],
      ['第一卷', 1]
    ])
    expect(nodes[0].kind === 'group' && nodes[0].children).toEqual([
      { kind: 'chapter', article: chapter('b', '第二卷'), number: 1 },
      { kind: 'chapter', article: chapter('a', '第二卷'), number: 2 }
    ])
  })
  it('keeps identically named nested parts under their respective parents', () => {
    const nodes = buildToc([chapter('a', '上篇 / 导论'), chapter('b', '下篇 / 导论')])
    const nested = nodes.map((n) => n.kind === 'group' && n.children[0])
    expect(nested[0]).not.toEqual(nested[1])
    expect(nodes).toMatchObject([
      {
        title: '上篇',
        count: 1,
        children: [{ title: '导论', children: [{ article: { id: 'a' } }] }]
      },
      {
        title: '下篇',
        count: 1,
        children: [{ title: '导论', children: [{ article: { id: 'b' } }] }]
      }
    ])
  })
  it('avoids adding an artificial level for plain text books', () => {
    expect(buildToc([chapter('a', '正文')])[0]).toMatchObject({
      kind: 'chapter',
      article: { id: 'a' }
    })
    expect(buildToc([])).toEqual([])
  })
})
