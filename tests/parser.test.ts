import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import iconv from 'iconv-lite'
import { parseTxt, parseEpub, htmlText } from '../src/main/adapters/importing/parser'
describe('local book parsing', () => {
  it('decodes GB18030 and preserves paragraphs, no API needed', () => {
    const result = parseTxt(
      iconv.encode('第一章 沟通\n先听懂对方。\n第二章 反馈\n描述真实事实。', 'gb18030'),
      '沟通.txt'
    )
    expect(result.encoding).toBe('gb18030')
    expect(result.chapters.map((c) => c.title)).toEqual(['第一章 沟通', '第二章 反馈'])
    expect(result.chapters[0].content).toBe('先听懂对方。')
  })
  it('provides explicit synthetic reading fragments without headings', () => {
    const result = parseTxt(strToU8('没有目录的原文。\n第二段。'), '随笔.txt')
    expect(result.chapters[0].synthetic).toBe(true)
    expect(result.chapters[0].content).toContain('第二段。')
  })
  it('rejects empty input and normalizes inactive HTML only', () => {
    expect(() => parseTxt(new Uint8Array(), '空.txt')).toThrow('没有可导入')
    expect(
      htmlText('<body><script>attack()</script><p>甲 &amp; 乙</p><img src="x"/><p>丙</p></body>')
    ).toBe('甲 & 乙\n[图片]\n丙')
  })
  it('reads arbitrary OPF location, spine order and same-file anchors', () => {
    const files = {
      'META-INF/container.xml':
        '<container><rootfiles><rootfile full-path="Book/pkg.opf"/></rootfiles></container>',
      'Book/pkg.opf':
        '<package><metadata><dc:title xmlns:dc="dc">测试书</dc:title><dc:creator xmlns:dc="dc">作者</dc:creator></metadata><manifest><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>',
      'Book/nav.xhtml':
        '<nav><a href="b.xhtml#one">第一节</a><a href="b.xhtml#two">第二节</a><a href="a.xhtml">后记</a></nav>',
      'Book/b.xhtml':
        '<body><h1 id="one">第一节</h1><p>第一节内容。</p><h1 id="two">第二节</h1><p>第二节内容。</p></body>',
      'Book/a.xhtml': '<body><p>后记内容。</p></body>'
    }
    const result = parseEpub(
      zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))),
      'test.epub'
    )
    expect(result.title).toBe('测试书')
    expect(result.author).toBe('作者')
    expect(result.chapters.map((c) => c.title)).toEqual(['第一节', '第二节', '后记'])
    expect(result.chapters[0].content).not.toContain('第二节内容')
  })
  it('rejects malformed EPUB and traversal resources', () => {
    expect(() => parseEpub(strToU8('not zip'), 'x.epub')).toThrow()
    const zip = zipSync({
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="../x.opf"/></rootfiles></container>'
      )
    })
    expect(() => parseEpub(zip, 'x.epub')).toThrow()
  })
})

import { applyImportEdits } from '../src/main/modules/importing/edits'
describe('import preview edits', () => {
  it('merges adjacent source segments without modifying the original preview', () => {
    const book = parseTxt(strToU8('第一章 测试\n正文一\n第二章 测试\n正文二'), 'test.txt')
    const result = applyImportEdits(book, {
      titles: ['合并章节', '第二章'],
      mergeWithPrevious: [1]
    })
    expect(result.chapters).toHaveLength(1)
    expect(result.chapters[0].title).toBe('合并章节')
    expect(result.chapters[0].content).toBe('正文一\n正文二')
    expect(book.chapters).toHaveLength(2)
  })
  it('rejects impossible preview edits', () => {
    const book = parseTxt(strToU8('正文'), 'test.txt')
    expect(() => applyImportEdits(book, { mergeWithPrevious: [0] })).toThrow('无效')
    expect(() => applyImportEdits(book, { titles: [] })).toThrow('不一致')
  })
})
