import type Database from 'better-sqlite3'
import {
  sessionActivities,
  actionActivities,
  type createMarchService
} from '../../modules/long-march/public'
import { createSessionRepository } from './session-repository'
import { createActionRepository } from './action-repository'

/** Atomically decorates source writes; business modules remain independent of rewards. */
export function createMarchObservedRepositories(
  db: Database.Database,
  march: ReturnType<typeof createMarchService>
) {
  const sessions = createSessionRepository(db)
  const actions = createActionRepository(db)
  db.transaction(() => {
    for (const filter of ['active', 'archived'] as const)
      for (const summary of sessions.list(filter)) {
        const source = sessions.get(summary.id)
        if (source) march.observe(sessionActivities(source))
      }
    for (const action of actions.list()) march.observe(actionActivities(action, 'standalone'))
  })()
  return {
    sessions: {
      ...sessions,
      save: (source: Parameters<typeof sessions.save>[0]) =>
        db.transaction(() => {
          sessions.save(source)
          march.observe(sessionActivities(source))
        })()
    },
    actions: {
      ...actions,
      save: (action: Parameters<typeof actions.save>[0]) =>
        db.transaction(() => {
          actions.save(action)
          march.observe(actionActivities(action, 'standalone'))
        })()
    }
  }
}
