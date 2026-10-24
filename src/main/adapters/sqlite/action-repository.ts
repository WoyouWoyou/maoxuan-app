import type Database from 'better-sqlite3'
import type { ActionItem } from '@shared/types'
import type { ActionRepository } from '../../modules/action-planning/public'
export function createActionRepository(db: Database.Database): ActionRepository {
  return {
    list: () =>
      (
        db.prepare('SELECT data FROM standalone_actions ORDER BY rowid').all() as { data: string }[]
      ).map((row) => JSON.parse(row.data) as ActionItem),
    get: (id) => {
      const row = db.prepare('SELECT data FROM standalone_actions WHERE id=?').get(id) as
        { data: string } | undefined
      return row ? (JSON.parse(row.data) as ActionItem) : undefined
    },
    save: (action) => {
      db.prepare(
        'INSERT INTO standalone_actions(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'
      ).run(action.id, JSON.stringify(action))
    }
  }
}
