import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import iconv from 'iconv-lite'
import type { ParsedBook, ParsedChapter } from '@shared/contracts/library'
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true
})
const array = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v]
function value(v: any): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (Array.isArray(v)) return value(v[0])
  if (!v || typeof v !== 'object') return ''
  return v['#text'] !== undefined
    ? String(v['#text'])
    : Object.entries(v)
        .filter(([k]) => !k.startsWith('@'))
        .map(([, x]) => value(x))
        .join(' ')
}
function entities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
    }
    return (
      ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[
        e.toLowerCase()
      ] ?? ''
    )
  })
}
export function htmlText(s: string): string {
  return entities(
    s
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<img\b[^>]*>/gi, '\n[图片]\n')
      .replace(/<\/?(?:p|div|h[1-6]|li|blockquote|br|section|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .split(/\r?\n/)
    .map((l) => l.replace(/[\t\u3000 ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}
export function decodeText(
  bytes: Uint8Array,
  encoding?: string
): { text: string; encoding: string } {
  let chosen = encoding
  if (!chosen) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) chosen = 'utf-16le'
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) chosen = 'utf-16be'
    else {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        chosen = 'utf-8'
      } catch {
        chosen = 'gb18030'
      }
    }
  }
  if (!['utf-8', 'gb18030', 'gbk', 'utf-16le', 'utf-16be'].includes(chosen))
    throw new Error('不支持的文本编码')
  return {
    text: iconv
      .decode(Buffer.from(bytes), chosen)
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, ''),
    encoding: chosen
  }
}
export function parseTxt(bytes: Uint8Array, filename: string, encoding?: string): ParsedBook {
  const decoded = decodeText(bytes, encoding)
  const lines = decoded.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const chapters: ParsedChapter[] = []
  let title = '正文',
    buffer: string[] = [],
    synthetic = true
  const flush = () => {
    if (buffer.length)
      chapters.push({
        title,
        content: buffer.join('\n'),
        path: '正文',
        source: `txt:${chapters.length}`,
        synthetic
      })
    buffer = []
  }
  for (const line of lines) {
    if (
      line.length < 100 &&
      /^(?:第[零〇一二三四五六七八九十百千万\d]+[章节卷部篇][\s：:.、]?.*|chapter\s+\w+.*)$/i.test(
        line
      )
    ) {
      flush()
      title = line
      synthetic = false
    } else {
      // Split pathological long paragraphs so the renderer and retrieval remain bounded.
      for (let offset = 0; offset < line.length; offset += 4000)
        buffer.push(line.slice(offset, offset + 4000))
      if (buffer.join('\n').length >= 12000) {
        flush()
        title = `阅读片段 ${chapters.length + 1}`
        synthetic = true
      }
    }
  }
  flush()
  if (!chapters.length) throw new Error('没有可导入的正文')
  return {
    title: filename.replace(/\.[^.]+$/, ''),
    author: '',
    format: 'txt',
    hash: createHash('sha256').update(bytes).update(decoded.encoding).digest('hex'),
    encoding: decoded.encoding,
    chapters,
    warnings: ['请检查编码、目录和正文预览；自动划分的片段不代表原书目录。']
  }
}
function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]).replace(/\\/g, '/')
  const path = posix.normalize(posix.join(posix.dirname(base), clean))
  if (path.startsWith('../') || path.startsWith('/') || /:\/\//.test(path))
    throw new Error('EPUB 包含非法资源路径')
  return path
}
export function parseEpub(bytes: Uint8Array, filename: string): ParsedBook {
  let size = 0,
    count = 0
  const entries = unzipSync(bytes, {
    filter(file) {
      size += file.originalSize
      count++
      if (size > 80 * 1024 * 1024 || file.originalSize > 20 * 1024 * 1024 || count > 6000)
        throw new Error('EPUB 解压体积或文件数量超出限制')
      if (file.name.startsWith('/') || file.name.split(/[\\/]/).includes('..'))
        throw new Error('EPUB 包含非法文件路径')
      return /\.(?:xml|opf|ncx|xhtml|html|htm)$/i.test(file.name)
    }
  })
  const read = (path: string) => {
    if (!entries[path]) throw new Error(`EPUB 缺少资源：${path}`)
    return new TextDecoder().decode(entries[path])
  }
  const root = xml.parse(read('META-INF/container.xml'))?.container?.rootfiles?.rootfile
  const opfPath = array(root)[0]?.['@full-path']
  if (!opfPath) throw new Error('EPUB 缺少 OPF 入口')
  const pkg = xml.parse(read(opfPath))?.package
  if (!pkg) throw new Error('无法读取 EPUB 书籍信息')
  const manifest = array<any>(pkg.manifest?.item)
  const byId = new Map(manifest.map((i) => [String(i['@id']), i]))
  const toc = new Map<string, { title: string; href: string; path: string }[]>()
  const add = (base: string, href: string, title: string, parents: string[] = []) => {
    if (!href || !title) return
    const path = resolvePath(base, href)
    toc.set(path, [...(toc.get(path) ?? []), { title, href, path: parents.join(' / ') || '正文' }])
  }
  const nav = manifest.find((i) =>
    String(i['@properties'] ?? '')
      .split(' ')
      .includes('nav')
  )
  if (nav) {
    const navPath = resolvePath(opfPath, nav['@href'])
    const document = xml.parse(read(navPath))
    const navs = array<any>(document.html?.body?.nav ?? document.nav)
    const selectedNav =
      navs.find((n) =>
        String(n['@type'] ?? '')
          .split(' ')
          .includes('toc')
      ) ?? navs[0]
    const walk = (items: any, parents: string[]) => {
      for (const item of array<any>(items)) {
        const a = item.a
        const title = value(a ?? item.span)
        if (a) add(navPath, a['@href'], title, parents)
        walk(item.ol?.li, title ? [...parents, title] : parents)
      }
    }
    if (selectedNav) walk(selectedNav.ol?.li, [])
    if (!toc.size)
      for (const match of read(navPath).matchAll(
        /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
      ))
        add(navPath, match[1], htmlText(match[2]))
  }
  const ncx = manifest.find((i) => i['@media-type'] === 'application/x-dtbncx+xml')
  if (!toc.size && ncx) {
    const ncxPath = resolvePath(opfPath, ncx['@href'])
    const walk = (points: any, parents: string[]) => {
      for (const p of array<any>(points)) {
        const title = value(p.navLabel?.text)
        add(ncxPath, p.content?.['@src'], title, parents)
        walk(p.navPoint, [...parents, title])
      }
    }
    walk(xml.parse(read(ncxPath))?.ncx?.navMap?.navPoint, [])
  }
  const chapters: ParsedChapter[] = [],
    warnings: string[] = ['首版提取正文，图片显示占位；不还原复杂版式和公式。']
  for (const ref of array<any>(pkg.spine?.itemref)) {
    const item = byId.get(String(ref['@idref']))
    if (!item || item === nav || !/html/.test(item['@media-type'] ?? '') || ref['@linear'] === 'no')
      continue
    const path = resolvePath(opfPath, item['@href']),
      raw = read(path)
    const body = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? raw
    const headings = toc.get(path) ?? []
    // Preserve spine order; split one XHTML only at ordered, existing anchors.
    const points = headings
      .map((h) => {
        const anchor = h.href.split('#')[1]
        if (!anchor) return { ...h, offset: 0 }
        const escaped = decodeURIComponent(anchor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const m = new RegExp(`<[^>]+(?:id|name)=["']${escaped}["'][^>]*>`, 'i').exec(body)
        return { ...h, offset: m?.index ?? -1 }
      })
      .filter((h) => h.offset >= 0)
      .filter((p, i, a) => !a.slice(0, i).some((x) => x.offset === p.offset))
      .sort((a, b) => a.offset - b.offset)
    if (!points.length || points[0].offset > 0)
      points.unshift({
        title:
          htmlText(raw.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? '') ||
          `章节 ${chapters.length + 1}`,
        href: '',
        path: '正文',
        offset: 0
      })
    points.forEach((p, i) => {
      const content = htmlText(body.slice(p.offset, points[i + 1]?.offset))
      if (content)
        chapters.push({
          title: p.title,
          path: p.path,
          content,
          source: `${path}${p.href.includes('#') ? '#' + p.href.split('#')[1] : ''}`
        })
    })
  }
  if (!chapters.length) throw new Error('EPUB 没有可提取正文（可能为图片书或加密文件）')
  return {
    title: value(pkg.metadata?.title) || filename.replace(/\.epub$/i, ''),
    author: value(array(pkg.metadata?.creator)[0]),
    format: 'epub',
    encoding: 'utf-8',
    hash: createHash('sha256').update(bytes).digest('hex'),
    chapters,
    warnings
  }
}
