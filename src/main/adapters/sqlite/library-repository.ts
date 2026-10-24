import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Article, ArticleMeta, SearchHit } from '@shared/types'
import {
  BUILTIN_BOOK_ID,
  BUILTIN_REVISION_ID,
  type Book,
  type BookScope,
  type ParsedBook
} from '@shared/contracts/library'
export function createLibraryRepository(handle: Database.Database) {
  const db = handle
  function queryBooks(includeHidden = false, id?: string): Book[] {
    return (
      db
        .prepare(
          `SELECT b.*, COUNT(a.id) chapters, COALESCE(SUM(LENGTH(a.content)),0) characters,
    (SELECT COUNT(*) FROM chapter_index i JOIN articles c ON c.id=i.article_id WHERE c.revision_id=b.revision_id) AS indexed_count
    FROM books b LEFT JOIN articles a ON a.revision_id=b.revision_id ${id !== undefined ? 'WHERE b.id=?' : includeHidden ? '' : 'WHERE b.hidden=0'} GROUP BY b.id ORDER BY b.created_at`
        )
        .all(...(id !== undefined ? [id] : [])) as any[]
    ).map((b) => ({
      bookId: b.id,
      revisionId: b.revision_id,
      title: b.title,
      author: b.author,
      format: b.format,
      profile: b.profile,
      chapters: b.chapters,
      characters: b.characters,
      createdAt: b.created_at,
      hidden: !!b.hidden,
      indexed: b.indexed_count
    }))
  }
  const listBooks = (includeHidden = false): Book[] => queryBooks(includeHidden)
  function requireBook(id = BUILTIN_BOOK_ID): Book {
    const book = queryBooks(true, id)[0]
    if (!book) throw new Error('书籍不存在')
    return book
  }
  function listChapters(scope?: BookScope): ArticleMeta[] {
    const book = scope ?? requireBook()
    return (
      db
        .prepare(
          'SELECT id,title,volume,is_core,core_order,LENGTH(content) length,book_id,revision_id FROM articles WHERE book_id=? AND revision_id=? ORDER BY ord'
        )
        .all(book.bookId, book.revisionId) as any[]
    ).map((r) => ({
      id: r.id,
      title: r.title,
      volume: r.volume,
      isCore: !!r.is_core,
      coreOrder: r.core_order,
      length: r.length,
      bookId: r.book_id,
      revisionId: r.revision_id
    }))
  }
  function getChapter(id: string, scope?: BookScope): Article | null {
    const row = db.prepare('SELECT * FROM articles WHERE id=?').get(id) as any
    if (!row) return null
    if (scope && (row.book_id !== scope.bookId || row.revision_id !== scope.revisionId))
      throw new Error('章节不属于当前书籍版本')
    const paragraphs = db
      .prepare('SELECT id,content FROM paragraphs WHERE article_id=? ORDER BY ord')
      .all(id) as { id: string; content: string }[]
    return {
      id,
      title: row.title,
      volume: row.volume,
      isCore: !!row.is_core,
      coreOrder: row.core_order,
      length: row.content.length,
      content: row.content,
      bookId: row.book_id,
      revisionId: row.revision_id,
      paragraphs: paragraphs.map((p) => p.content),
      paragraphIds: paragraphs.map((p) => p.id)
    }
  }
  function searchChapters(query: string, limit = 30, scope?: BookScope): SearchHit[] {
    const book = scope ?? requireBook()
    const q = query.trim().slice(0, 300)
    if (!q) return []
    if (q.length >= 3) {
      try {
        const rows = db
          .prepare(
            `SELECT a.id,a.title,a.volume,snippet(articles_fts,1,'【','】','…',24) snippet
        FROM articles_fts JOIN articles a ON a.rowid=articles_fts.rowid
        WHERE articles_fts MATCH ? AND a.book_id=? AND a.revision_id=? ORDER BY bm25(articles_fts) LIMIT ?`
          )
          .all(
            '"' + q.replace(/"/g, '""') + '"',
            book.bookId,
            book.revisionId,
            Math.max(1, Math.min(200, limit))
          ) as SearchHit[]
        return rows
      } catch {
        /* Older SQLite tokenizer builds retain literal search fallback. */
      }
    }
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    return (
      db
        .prepare(
          "SELECT id,title,volume,content FROM articles WHERE book_id=? AND revision_id=? AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') ORDER BY ord LIMIT ?"
        )
        .all(
          book.bookId,
          book.revisionId,
          pattern,
          pattern,
          Math.max(1, Math.min(200, limit))
        ) as any[]
    ).map((r) => {
      const i = Math.max(0, r.content.indexOf(q))
      return {
        id: r.id,
        title: r.title,
        volume: r.volume,
        snippet: r.content.slice(Math.max(0, i - 30), i + 100)
      }
    })
  }
  function writeParagraphs(id: string, content: string): void {
    const insert = db.prepare('INSERT INTO paragraphs(id,article_id,ord,content) VALUES(?,?,?,?)')
    content
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((p, i) => insert.run(`${id}:p${i}`, id, i, p))
  }
  function syncBuiltin(items: any[]): void {
    const hash = createHash('sha256').update(JSON.stringify(items)).digest('hex')
    const existing = db.prepare('SELECT hash FROM books WHERE id=?').get(BUILTIN_BOOK_ID) as
      { hash: string } | undefined
    if (existing) {
      if (existing.hash !== hash)
        throw new Error('内置原文版本已变化，请先增加内容版本迁移，避免旧笔记错位')
      return
    }
    db.transaction(() => {
      db.prepare(
        'INSERT INTO books(id,revision_id,title,author,format,profile,hash,created_at) VALUES(?,?,?,?,?,?,?,?)'
      ).run(
        BUILTIN_BOOK_ID,
        BUILTIN_REVISION_ID,
        '毛泽东选集',
        '毛泽东',
        'builtin',
        'maoxuan',
        hash,
        new Date().toISOString()
      )
      const insert = db.prepare(
        'INSERT OR IGNORE INTO articles(id,title,volume,is_core,core_order,content,ord,book_id,revision_id) VALUES(?,?,?,?,?,?,?,?,?)'
      )
      items.forEach((a, i) => {
        const content = a.content.replace(/^\*\s*\n/, '')
        insert.run(
          a.id,
          a.title,
          a.volume,
          a.isCore ? 1 : 0,
          a.coreOrder ?? null,
          content,
          i,
          BUILTIN_BOOK_ID,
          BUILTIN_REVISION_ID
        )
      })
      // Keep existing source text/indices exactly as used by legacy reflections.
      for (const a of db
        .prepare('SELECT id,content FROM articles WHERE book_id=?')
        .all(BUILTIN_BOOK_ID) as any[])
        writeParagraphs(a.id, a.content)
    })()
  }
  function importBook(parsed: ParsedBook, title: string, author: string): Book {
    const existing = db
      .prepare('SELECT id FROM books WHERE hash=? AND format<>?')
      .get(parsed.hash, 'builtin') as { id: string } | undefined
    if (existing) {
      db.prepare('UPDATE books SET hidden=0 WHERE id=?').run(existing.id)
      return requireBook(existing.id)
    }
    const id = randomUUID(),
      revision = randomUUID()
    db.transaction(() => {
      db.prepare(
        'INSERT INTO books(id,revision_id,title,author,format,profile,hash,created_at) VALUES(?,?,?,?,?,?,?,?)'
      ).run(
        id,
        revision,
        title.trim() || parsed.title,
        author.trim(),
        parsed.format,
        'generic',
        parsed.hash,
        new Date().toISOString()
      )
      const insert = db.prepare(
        'INSERT INTO articles(id,title,volume,is_core,core_order,content,ord,book_id,revision_id,source) VALUES(?,?,?,0,NULL,?,?,?,?,?)'
      )
      parsed.chapters.forEach((c, i) => {
        const chapterId = `${revision}:${i}`
        insert.run(chapterId, c.title, c.path || '正文', c.content, i, id, revision, c.source)
        writeParagraphs(chapterId, c.content)
      })
    })()
    return requireBook(id)
  }
  function hideBook(id: string, hidden: boolean): void {
    if (id === BUILTIN_BOOK_ID) throw new Error('内置书籍不能隐藏')
    requireBook(id)
    db.prepare('UPDATE books SET hidden=? WHERE id=?').run(hidden ? 1 : 0, id)
  }
  function titleMap(scope?: BookScope): Map<string, string> {
    return new Map(listChapters(scope).map((c) => [c.id, c.title]))
  }

  return {
    listBooks,
    requireBook,
    listChapters,
    getChapter,
    searchChapters,
    syncBuiltin,
    importBook,
    hideBook,
    titleMap
  }
}
