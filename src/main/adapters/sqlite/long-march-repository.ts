import { ACTIVITY_POINTS, DAILY_GROWTH_LIMIT } from '@shared/long-march'
import type Database from 'better-sqlite3'
import type { MarchRepository } from '../../modules/long-march/public'
export function createMarchRepository(db: Database.Database): MarchRepository {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO march_activities(id,kind,created_at,points,reward_day) VALUES(?,?,?,?,?)'
  )
  return {
    transaction: (work) => db.transaction(work)(),
    addActivities: (events) => {
      db.transaction(() => {
        // Use receipt time, never source timestamps: old records cannot bypass today's cap.
        const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
        for (const e of events) {
          const total = (db.prepare('SELECT COALESCE(SUM(points),0) AS total FROM march_activities WHERE reward_day=?').get(day) as { total: number }).total
          insert.run(e.id, e.kind, e.createdAt, Math.max(0, Math.min(ACTIVITY_POINTS, DAILY_GROWTH_LIMIT - total)), day)
        }
      })()
    },
    rewards: () => {
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      return db.prepare('SELECT COALESCE(SUM(points),0) AS earned, COALESCE(SUM(CASE WHEN reward_day=? THEN points ELSE 0 END),0) AS todayEarned FROM march_activities').get(day) as { earned: number; todayEarned: number }
    },
    activities: () => {
      const counts = { reading: 0, reflection: 0, action: 0, journal: 0 }
      for (const row of db
        .prepare('SELECT kind,COUNT(*) AS count FROM march_activities GROUP BY kind')
        .all() as { kind: keyof typeof counts; count: number }[])
        counts[row.kind] = row.count
      return counts
    },
    plantings: () =>
      db
        .prepare(
          'SELECT node_id AS nodeId,request_id AS requestId, planted_at AS plantedAt FROM march_plants ORDER BY rowid'
        )
        .all() as { nodeId: string; requestId: string; plantedAt: string }[],
    addPlant: (nodeId, requestId) => {
      db.prepare('INSERT INTO march_plants(node_id,request_id,planted_at) VALUES(?,?,?)').run(nodeId, requestId, new Date().toISOString())
    },
    collected: () =>
      (db.prepare('SELECT node_id FROM march_collection').all() as { node_id: string }[]).map(
        (r) => r.node_id
      ),
    collect: (nodeId) => {
      db.prepare('INSERT OR IGNORE INTO march_collection(node_id) VALUES(?)').run(nodeId)
    }
  }
}
