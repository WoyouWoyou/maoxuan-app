import type { IndexRepository } from '../../modules/retrieval/public'
import type Database from 'better-sqlite3'
export function createIndexRepository(handle: Database.Database): IndexRepository {
  return {
    get: (id) =>
      handle.prepare('SELECT signature,summary FROM chapter_index WHERE article_id=?').get(id) as
        { signature: string; summary: string } | undefined,
    getBlock: (id, signature, ord) =>
      (
        handle
          .prepare('SELECT summary FROM index_blocks WHERE article_id=? AND signature=? AND ord=?')
          .get(id, signature, ord) as { summary: string } | undefined
      )?.summary,
    putBlock: (id, signature, ord, summary) => {
      handle
        .prepare(
          'INSERT OR REPLACE INTO index_blocks(article_id,signature,ord,summary) VALUES(?,?,?,?)'
        )
        .run(id, signature, ord, summary)
    },
    put: (id, signature, summary) => {
      handle
        .prepare(
          'INSERT INTO chapter_index(article_id,signature,summary) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET signature=excluded.signature,summary=excluded.summary'
        )
        .run(id, signature, summary)
    }
  }
}
