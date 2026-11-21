import { createAssetExchange } from '../network/sync-assets'
import type { JournalAssets } from '../../modules/journal/public'
import type Database from 'better-sqlite3'
import { createSessionRepository } from './session-repository'
import { createActionRepository } from './action-repository'
import { createJournalRepository } from './journal-repository'
import { documentKey, canonical, type SyncDocument } from '@shared/sync/protocol'
import { createMarchRepository } from './long-march-repository'
import { actionActivities, sessionActivities } from '@shared/engine/march-activity'
import type { MarchState } from '@shared/sync/march'
import type { SyncRepository } from '../network/lan-sync'
export function createSyncRepository(
  db: Database.Database,
  assets?: JournalAssets
): SyncRepository {
  const sessions = createSessionRepository(db),
    actions = createActionRepository(db),
    journal = createJournalRepository(db),
    march = createMarchRepository(db)
  const read = (): SyncDocument[] => {
    const state = journal.read()
    const docs: SyncDocument[] = [
      ...state.folders.map((f) => ({ kind: 'folder' as const, id: f.id, value: f })),
      ...state.notes.map((n) => ({ kind: 'note' as const, id: n.id, value: n })),
      ...actions.list().map((a) => ({ kind: 'action' as const, id: a.id, value: a }))
    ]
    for (const filter of ['active', 'archived', 'trash'] as const)
      for (const summary of sessions.list(filter)) {
        const s = sessions.get(summary.id)!
        if (s.data.book && s.data.book.bookId !== 'maoxuan') continue
        docs.push({
          kind: 'session',
          id: s.id,
          value: {
            session: s,
            versions: sessions.versions(s.id).map((v) => sessions.version(v.id)!),
            messages: sessions.messages(s.id)
          }
        })
      }
    return docs
  }
  const readMarch = (): MarchState => ({
    events: db
      .prepare(
        'SELECT id,kind,created_at AS createdAt,points,reward_day AS day FROM march_activities ORDER BY id'
      )
      .all() as MarchState['events'],
    plants: march.plantings(),
    collected: march.collected().sort()
  })
  return {
    read,
    readMarch,
    writeMarch: (state) => {
      const saveEvent = db.prepare(`
        INSERT INTO march_activities(id,kind,created_at,points,reward_day) VALUES(?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,created_at=excluded.created_at,
          points=excluded.points,reward_day=excluded.reward_day
      `)
      const before = readMarch()
      const events = new Map(before.events.map((event) => [event.id, canonical(event)]))
      for (const event of state.events)
        if (events.get(event.id) !== canonical(event))
          saveEvent.run(event.id, event.kind, event.createdAt, event.points, event.day)
      if (canonical(before.plants) !== canonical(state.plants)) {
        db.prepare('DELETE FROM march_plants').run()
        const insert = db.prepare(
          'INSERT INTO march_plants(request_id,node_id,planted_at) VALUES(?,?,?)'
        )
        for (const plant of state.plants) insert.run(plant.requestId, plant.nodeId, plant.plantedAt)
      }
      for (const id of state.collected) march.collect(id)
    },
    asset: assets ? createAssetExchange(read, assets) : undefined,
    transaction: (work) => db.transaction(work)(),
    apply: (docs) => {
      const prior = new Map(read().map((d) => [documentKey(d), canonical(d)]))
      const state = journal.read()
      const activities: Parameters<typeof march.addActivities>[0] = []
      for (const d of docs) {
        if (prior.get(documentKey(d)) === canonical(d)) continue
        if (d.kind === 'note' || d.kind === 'folder') {
          if (d.kind === 'note') {
            const index = state.notes.findIndex((n) => n.id === d.id)
            const value = {
              ...d.value,
              revision: (index < 0 ? 0 : state.notes[index].revision) + 1
            }
            if (value.completedAt && !value.id.startsWith('sync-conflict:'))
              activities.push({
                id: `journal:${value.id}:completed`,
                kind: 'journal',
                createdAt: value.completedAt
              })
            if (index < 0) state.notes.push(value)
            else state.notes[index] = value
          } else {
            const index = state.folders.findIndex((f) => f.id === d.id)
            if (index < 0) state.folders.push(d.value)
            else state.folders[index] = d.value
          }
        } else if (d.kind === 'action') {
          actions.save(d.value)
          activities.push(...actionActivities(d.value, 'standalone'))
        } else {
          const old = sessions.get(d.id)
          const s = { ...d.value.session, stateVersion: (old?.stateVersion ?? 0) + 1 }
          if (!old) sessions.insert(s)
          let nextVersion = Math.max(0, ...sessions.versions(d.id).map((v) => v.versionNo))
          for (const v of [...d.value.versions].sort((a, b) => a.versionNo - b.versionNo)) {
            const priorVersion = sessions.version(v.id)
            if (priorVersion) {
              if (canonical(priorVersion) !== canonical(v))
                throw Error('历史版本身份冲突，已保留原数据')
            } else sessions.snapshot({ ...v, versionNo: ++nextVersion })
          }
          sessions.save({ ...s, versionNo: nextVersion })
          activities.push(...sessionActivities(s))
          sessions.clearMessages(d.id)
          for (const m of d.value.messages) sessions.addMessage(m)
        }
      }
      const folders = new Map(state.folders.map((f) => [f.id, f]))
      for (const f of state.folders) {
        const seen = new Set<string>()
        let id: string | null = f.id
        while (id) {
          if (seen.has(id) || !folders.has(id)) throw Error('同步文件夹关系无效')
          seen.add(id)
          id = folders.get(id)!.parentId
        }
      }
      for (const n of state.notes)
        if (n.folderId && !folders.has(n.folderId)) throw Error('同步记录缺少文件夹')
      journal.write(state)
      if (activities.length) march.addActivities(activities)
    }
  }
}
