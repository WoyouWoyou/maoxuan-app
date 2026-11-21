import type Database from 'better-sqlite3'
import type { JournalState } from '@shared/journal'
import type { JournalRepository } from '../../modules/journal/public'
export function createJournalRepository(db: Database.Database): JournalRepository {
  return {
    read: () =>
      JSON.parse(
        (db.prepare('SELECT data FROM journal_state WHERE id=1').get() as { data: string }).data
      ) as JournalState,
    write: (state) => {
      db.prepare('UPDATE journal_state SET data=? WHERE id=1').run(JSON.stringify(state))
    },
    transaction: (work) => db.transaction(work)()
  }
}
