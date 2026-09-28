import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getDb } from './db'
import type { Article, ArticleMeta, SearchHit } from '@shared/types'

type SqliteDb = ReturnType<typeof getDb>

interface ArticleRow {
  id: string
  title: string
  volume: string
  is_core: number
  core_order: number | null
  content: string
  ord: number
}

interface JsonArticle {
  id: string
  title: string
  volume: string
  isCore?: boolean
  coreOrder?: number | null
  content: string
}

interface FtsRow {
  id: string
  title: string
  volume: string
  snippet: string
}

interface LikeRow {
  id: string
  title: string
  volume: string
  content: string
}

const cache = new Map<string, Article>()
let ordered: ArticleMeta[] = []

function articlesJsonPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'articles.json')
    : path.join(app.getAppPath(), 'resources', 'articles.json')
}

/** 去掉 content 开头孤立的 `*` 行。 */
function normalizeContent(content: string): string {
  const lines = content.split('\n')
  if (lines.length > 0 && lines[0].trim() === '*') lines.shift()
  return lines.join('\n')
}

function splitParagraphs(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function toMeta(article: Article): ArticleMeta {
  return {
    id: article.id,
    title: article.title,
    volume: article.volume,
    isCore: article.isCore,
    coreOrder: article.coreOrder,
    length: article.length
  }
}

function importFromJson(handle: SqliteDb, items: JsonArticle[]): void {
  const insert = handle.prepare(
    'INSERT OR REPLACE INTO articles (id, title, volume, is_core, core_order, content, ord) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const run = handle.transaction((rows: JsonArticle[]) => {
    handle.prepare('DELETE FROM articles').run()
    rows.forEach((item, index) => {
      insert.run(
        item.id,
        item.title,
        item.volume,
        item.isCore ? 1 : 0,
        item.coreOrder ?? null,
        normalizeContent(item.content),
        index
      )
    })
    handle.prepare("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')").run()
  })
  run(items)
}

export function loadArticles(): void {
  const handle = getDb()
  const items = JSON.parse(fs.readFileSync(articlesJsonPath(), 'utf-8')) as JsonArticle[]
  const counted = handle.prepare('SELECT COUNT(*) AS total FROM articles').get() as { total: number }
  if (counted.total !== items.length) importFromJson(handle, items)

  const rows = handle
    .prepare('SELECT id, title, volume, is_core, core_order, content, ord FROM articles ORDER BY ord ASC')
    .all() as ArticleRow[]

  cache.clear()
  const metas: ArticleMeta[] = []
  for (const row of rows) {
    const content = row.content
    const article: Article = {
      id: row.id,
      title: row.title,
      volume: row.volume,
      isCore: row.is_core === 1,
      coreOrder: row.core_order,
      length: content.length,
      content,
      paragraphs: splitParagraphs(content)
    }
    cache.set(article.id, article)
    metas.push(toMeta(article))
  }
  ordered = metas
}

export function listArticles(): ArticleMeta[] {
  return ordered
}

export function getArticle(id: string): Article | null {
  return cache.get(id) ?? null
}

export function articleTitleMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const meta of ordered) map.set(meta.id, meta.title)
  return map
}

function toSingleLine(text: string, limit?: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return limit !== undefined && flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function likeSnippet(content: string, query: string): string {
  const index = content.indexOf(query)
  if (index < 0) return toSingleLine(content, 80)
  const start = Math.max(0, index - 40)
  const end = Math.min(content.length, index + query.length + 40)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  const before = content.slice(start, index)
  const hit = content.slice(index, index + query.length)
  const after = content.slice(index + query.length, end)
  return toSingleLine(`${prefix}${before}【${hit}】${after}${suffix}`)
}

function ftsSearch(query: string, limit: number): SearchHit[] {
  const match = `"${query.replace(/"/g, '""')}"`
  const pattern = `%${escapeLike(query)}%`
  const rows = getDb()
    .prepare(
      `SELECT a.id AS id, a.title AS title, a.volume AS volume,
              snippet(articles_fts, 1, '【', '】', '…', 24) AS snippet,
              (CASE WHEN a.title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END) AS title_hit,
              bm25(articles_fts) AS score
       FROM articles_fts
       JOIN articles a ON a.rowid = articles_fts.rowid
       WHERE articles_fts MATCH ?
       ORDER BY title_hit ASC, score ASC
       LIMIT ?`
    )
    .all(pattern, match, limit) as FtsRow[]
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    volume: row.volume,
    snippet: toSingleLine(row.snippet)
  }))
}

function likeSearch(query: string, limit: number): SearchHit[] {
  const pattern = `%${escapeLike(query)}%`
  const rows = getDb()
    .prepare(
      `SELECT id, title, volume, content,
              (CASE WHEN title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END) AS title_hit
       FROM articles
       WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'
       ORDER BY title_hit ASC, ord ASC
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit) as LikeRow[]
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    volume: row.volume,
    snippet: likeSnippet(row.content, query)
  }))
}

export function searchArticles(query: string, limit = 30): SearchHit[] {
  const clean = query.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const capped = Math.max(1, Math.min(Math.floor(limit) || 30, 200))
  if (clean.length >= 3) {
    try {
      return ftsSearch(clean, capped)
    } catch {
      return likeSearch(clean, capped)
    }
  }
  return likeSearch(clean, capped)
}
