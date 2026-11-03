import { createAssetExchange } from '../network/sync-assets'
import type { JournalAssets } from '../../modules/journal/public'
import type Database from 'better-sqlite3'
import { createSessionRepository } from './session-repository'
import { createActionRepository } from './action-repository'
import { createJournalRepository } from './journal-repository'
import { documentKey, canonical, type SyncDocument } from '@shared/sync/protocol'
import type { SyncRepository } from '../network/lan-sync'
export function createSyncRepository(
  db: Database.Database,
  assets?: JournalAssets
): SyncRepository {
  const sessions = createSessionRepository(db),
    actions = createActionRepository(db),
    journal = createJournalRepository(db)
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
  return {
    read,
    asset: assets ? createAssetExchange(read, assets) : undefined,
    transaction: (work) => db.transaction(work)(),
    apply: (docs) => {
      const prior = new Map(read().map((d) => [documentKey(d), canonical(d)]))
      const state = journal.read()
      for (const d of docs) {
        if (prior.get(documentKey(d)) === canonical(d)) continue
        if (d.kind === 'note' || d.kind === 'folder') {
          if (d.kind === 'note') {
            const index = state.notes.findIndex((n) => n.id === d.id)
            const value = {
              ...d.value,
              revision: (index < 0 ? 0 : state.notes[index].revision) + 1
            }
            if (index < 0) state.notes.push(value)
            else state.notes[index] = value
          } else {
            const index = state.folders.findIndex((f) => f.id === d.id)
            if (index < 0) state.folders.push(d.value)
            else state.folders[index] = d.value
          }
        } else if (d.kind === 'action') actions.save(d.value)
        else {
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
    }
  }
}
