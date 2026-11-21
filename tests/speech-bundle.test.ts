import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrate } from '../src/main/adapters/sqlite/migrations'
import { createLibraryRepository } from '../src/main/adapters/sqlite/library-repository'
import { DEFAULT_READER_PREFERENCES, speechChunks } from '../src/shared/contracts/reader'
import { createSpeechCache } from '../src/main/adapters/speech/cache'

const temporary = await mkdtemp(path.join(os.tmpdir(), 'maoxuan-offline-'))
afterAll(() => rm(temporary, { recursive: true, force: true }))

describe('shipped core article audio', () => {
  it('plays every core paragraph from real imported text with no network or user cache', async () => {
    const db = new Database(':memory:')
    try {
      db.exec(`CREATE TABLE sessions(id TEXT PRIMARY KEY);
        CREATE TABLE articles(id TEXT PRIMARY KEY,title TEXT,volume TEXT,is_core INTEGER,core_order INTEGER,content TEXT,ord INTEGER);
        CREATE VIRTUAL TABLE articles_fts USING fts5(title,content,content='articles',content_rowid='rowid',tokenize='trigram');`)
      migrate(db)
      const repo = createLibraryRepository(db)
      const articles = JSON.parse(await readFile('resources/articles.json', 'utf8'))
      // Exercise the real importer, not a second implementation of its text normalization.
      repo.syncBuiltin(articles)
      const network = vi.fn(async () => {
        throw new Error('network disabled')
      })
      const userCache = path.join(temporary, 'empty-user-cache')
      const cache = createSpeechCache(userCache, network, {
        bundledDirectory: path.resolve('resources/core-audio/v1')
      })
      const core = repo.listChapters().filter((article) => article.isCore)
      expect(core).toHaveLength(5)
      for (const voice of [DEFAULT_READER_PREFERENCES.voice, 'zh-CN-XiaoxiaoNeural']) {
        let chunks = 0
        for (const article of core) {
          const chapter = repo.getChapter(article.id)!
          for (const paragraph of chapter.paragraphs) {
            for (const text of speechChunks(paragraph)) {
              const audio = await cache.get(
                { id: `${article.id}:${chunks++}`, text, voice },
                new AbortController().signal
              )
              const mp3 = Buffer.from(audio)
              expect(mp3.length).toBeGreaterThan(100)
              expect(
                mp3.subarray(0, 3).toString() === 'ID3' ||
                  (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0)
              ).toBe(true)
            }
          }
        }
        expect(chunks).toBeGreaterThan(800)
      }
      expect(network).not.toHaveBeenCalled()
      await expect(readdir(userCache)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      db.close()
    }
  })
})
