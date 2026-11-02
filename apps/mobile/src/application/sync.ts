import { registerPlugin, Capacitor } from '@capacitor/core'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import {
  canonical,
  conflictCopy,
  documentKey,
  validateDocument,
  type SyncDocument,
  type SyncReply
} from '@shared/sync/protocol'
import type { AtomicStore, Commit } from './ports'
import { newMeta, type Entity } from '../domain/models'
import type { DesktopPayload } from './desktop-record'
const native = registerPlugin<{
  exchange(input: {
    url: string
    fingerprint: string
    token: string
    body: string
  }): Promise<{ body: string }>
}>('LanSync')
const hash = (v: unknown) => bytesToHex(sha256(utf8ToBytes(canonical(v))))
export interface SyncResult {
  count: number
  conflicts: { key: string; local: SyncDocument; remote: SyncDocument }[]
}
export async function synchronize(store: AtomicStore, pairing: string): Promise<SyncResult> {
  if (Capacitor.getPlatform() !== 'android')
    throw Error('请在 Android APK 中连接电脑；浏览器不支持电脑证书固定')
  const pair = JSON.parse(pairing)
  if (
    pair.protocol !== 2 ||
    !/^https:\/\//.test(pair.url) ||
    !/^([a-f0-9]{64})$/.test(pair.fingerprint) ||
    !/^([a-f0-9]{64})$/.test(pair.token)
  )
    throw Error('配对码无效')
  return exchangeSnapshot(
    store,
    pair.fingerprint,
    async (body) => (await native.exchange({ ...pair, body })).body
  )
}
export async function exchangeSnapshot(
  store: AtomicStore,
  peer: string,
  exchange: (body: string) => Promise<string>
): Promise<SyncResult> {
  const snapshot = await store.snapshot()
  const entities = snapshot.entities
  const current = (id: string) => entities.find((e) => e.id === id)
  const journalEntity = entities.find((e) => e.kind === 'desktop' && e.payload.type === 'journal')
  const journal =
    journalEntity?.kind === 'desktop' && journalEntity.payload.type === 'journal'
      ? structuredClone(journalEntity.payload.value)
      : { notes: [], folders: [] }
  const docs: SyncDocument[] = [
    ...journal.notes
      .filter((n) => !n.attachments.length)
      .map((n) => ({ kind: 'note' as const, id: n.id, value: n })),
    ...journal.folders.map((f) => ({ kind: 'folder' as const, id: f.id, value: f }))
  ]
  for (const e of entities) {
    if (e.kind !== 'desktop') continue
    const p = e.payload
    if (p.type === 'action') docs.push({ kind: 'action', id: p.value.id, value: p.value })
    if (
      p.type === 'session' &&
      (!p.value.session.data.book || p.value.session.data.book.bookId === 'maoxuan')
    )
      docs.push({
        kind: 'session',
        id: p.value.session.id,
        value: { session: p.value.session, versions: p.value.versions, messages: p.value.messages }
      })
  }
  const metaId = `desktop:sync:${peer}`
  const prior = current(metaId)
  const meta =
    prior?.kind === 'desktop' && prior.payload.type === 'settings' ? prior.payload.value : {}
  const baseline = (meta.baseline ?? {}) as Record<string, string>
  const requested = docs
    .map((document) => ({ document, base: baseline[documentKey(document)] ?? null }))
    .filter((c) => hash(c.document) !== baseline[documentKey(c.document)])
  const reply = JSON.parse(
    await exchange(JSON.stringify({ protocol: 2, changes: requested }))
  ) as SyncReply
  if (
    reply.protocol !== 2 ||
    !Array.isArray(reply.documents) ||
    reply.documents.length > 10000 ||
    !Array.isArray(reply.conflicts)
  )
    throw Error('电脑响应格式不兼容')
  const seen = new Set<string>()
  for (const d of reply.documents) {
    validateDocument(d)
    const key = documentKey(d)
    if (seen.has(key)) throw Error('重复远端实体')
    seen.add(key)
  }
  const localMap = new Map(docs.map((d) => [documentKey(d), d]))
  for (const key of reply.conflicts) {
    const original = localMap.get(key)
    if (!original) throw Error('无效冲突回执')
    validateDocument(original)
    let expected = conflictCopy(original, hash)
    let preserved = false
    const visited = new Set<string>()
    for (let n = 0; n <= reply.documents.length; n++) {
      if (visited.has(expected.id)) break
      visited.add(expected.id)
      const copy = reply.documents.find((d) => documentKey(d) === documentKey(expected))
      if (!copy) break
      if (canonical(copy) === canonical(expected)) {
        preserved = true
        break
      }
      expected = conflictCopy(original, hash, hash(copy))
    }
    if (!preserved) throw Error('电脑未提供完整冲突副本，本机数据保持不变')
  }
  const conflicts: SyncResult['conflicts'] = []
  const commits: Commit[] = []
  const save = (id: string, payload: DesktopPayload) => {
    const old = current(id)
    commits.push({
      entity: { ...newMeta(), id, kind: 'desktop', version: (old?.version ?? 0) + 1, payload },
      expectedVersion: old?.version ?? 0,
      operationId: crypto.randomUUID()
    })
  }
  let journalChanged = false
  for (const d of reply.documents) {
    const key = documentKey(d)
    if (reply.conflicts.includes(key)) {
      const local = localMap.get(key)
      if (local) conflicts.push({ key, local, remote: d })
    }
    baseline[key] = hash(d)
    if (localMap.has(key) && hash(localMap.get(key)) === hash(d)) continue
    if (d.kind === 'note') {
      const index = journal.notes.findIndex((n) => n.id === d.id)
      if (index < 0) journal.notes.push(d.value)
      else journal.notes[index] = d.value
      journalChanged = true
    } else if (d.kind === 'folder') {
      const index = journal.folders.findIndex((f) => f.id === d.id)
      if (index < 0) journal.folders.push(d.value)
      else journal.folders[index] = d.value
      journalChanged = true
    } else if (d.kind === 'action')
      save(`desktop:action:${d.id}`, { type: 'action', value: d.value })
    else {
      const old = current(`desktop:session:${d.id}`)
      const oldRecord =
        old?.kind === 'desktop' && old.payload.type === 'session' ? old.payload.value : undefined
      save(`desktop:session:${d.id}`, {
        type: 'session',
        value: {
          ...d.value,
          session: {
            ...d.value.session,
            stateVersion:
              (old?.kind === 'desktop' && old.payload.type === 'session'
                ? old.payload.value.session.stateVersion
                : 0) + 1
          },
          receipts: oldRecord?.receipts ?? {},
          chatEpoch: (oldRecord?.chatEpoch ?? 0) + 1
        }
      })
    }
  }
  const folderIds = new Set(journal.folders.map((f) => f.id))
  if (journal.notes.some((n) => n.folderId && !folderIds.has(n.folderId)))
    throw Error('同步记录缺少目录，已保留本地数据')
  if (journalChanged) save('desktop:journal', { type: 'journal', value: journal })
  save(metaId, {
    type: 'settings',
    value: { baseline, conflicts, lastSync: new Date().toISOString() }
  })
  await store.batch(commits)
  return { count: reply.documents.length, conflicts }
}
