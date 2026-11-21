import { receiveSpeech } from './speech-download'
import type { SpeechDownload } from '@shared/sync/speech'
import {
  CHUNK_BYTES,
  MAX_ASSET_BYTES,
  assetHash,
  encodeAsset,
  decodeAsset,
  assetEntityId
} from '@shared/sync/assets'
import { registerPlugin, Capacitor } from '@capacitor/core'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import {
  canonical,
  conflictCopy,
  documentKey,
  validateDocument,
  type SyncDocument,
  type SyncReply,
  type SyncPeer,
  type SyncStrategy
} from '@shared/sync/protocol'
import { validateMarchState } from '@shared/sync/march'
import { pairingCode, pairingHash } from '@shared/sync/pairing'
import { mobileMarch } from './march'
import type { AtomicStore, Commit } from './ports'
import { newMeta, type Entity } from '../domain/models'
import type { DesktopPayload } from './desktop-record'
const native = registerPlugin<{
  discover(): Promise<{ devices: SyncPeer[] }>
  requestLanPermission(): Promise<{ granted: boolean }>
  exchange(input: {
    url: string
    fingerprint: string
    token?: string
    body: string
  }): Promise<{ body: string }>
}>('LanSync')
const hash = (v: unknown) => bytesToHex(sha256(utf8ToBytes(canonical(v))))
export interface SyncResult {
  count: number
  achievements: boolean
  attachments?: { transferred: number; pending: number; errors: string[] }
  conflicts: { key: string; local: SyncDocument; remote: SyncDocument }[]
}
export async function discoverSyncDevices(): Promise<SyncPeer[]> {
  if (Capacitor.getPlatform() !== 'android') return []
  return (await native.discover()).devices
}

export async function requestLanPermission(): Promise<boolean> {
  return (await native.requestLanPermission()).granted
}

export async function pairWithDesktop(
  peer: SyncPeer,
  showCode: (code: string) => void
): Promise<string> {
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const call = async (input: object) =>
    JSON.parse((await native.exchange({ ...peer, body: JSON.stringify(input) })).body)
  const { nonce: challenge } = await call({
    operation: 'pair-start',
    sessionId: peer.id,
    commitment: pairingHash(nonce)
  })
  if (typeof challenge !== 'string' || !/^[a-f0-9]{64}$/.test(challenge))
    throw Error('电脑配对响应无效')
  showCode(pairingCode(peer.fingerprint, nonce, challenge))
  const { token } = await call({ operation: 'pair-confirm', sessionId: peer.id, nonce })
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Error('电脑未完成配对')
  return token
}

export async function synchronize(
  store: AtomicStore,
  peer: SyncPeer,
  token: string,
  strategy: SyncStrategy
): Promise<SyncResult> {
  if (Capacitor.getPlatform() !== 'android')
    throw Error('请在 Android APK 中连接电脑；浏览器不支持电脑证书固定')
  return exchangeSnapshot(
    store,
    peer.fingerprint,
    async (body) => (await native.exchange({ ...peer, token, body })).body,
    strategy
  )
}
export async function downloadSpeech(
  peer: SyncPeer,
  token: string,
  request: SpeechDownload,
  progress: (ready: number, available: number) => void
) {
  const { speechFiles } = await import('../adapters/speech-files')
  return receiveSpeech(
    request,
    async (body) => JSON.parse((await native.exchange({ ...peer, token, body: JSON.stringify(body) })).body),
    speechFiles,
    progress
  )
}

export async function exchangeSnapshot(
  store: AtomicStore,
  peer: string,
  exchange: (body: string) => Promise<string>,
  strategy: SyncStrategy = 'keep-both'
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
    ...journal.notes.map((n) => ({ kind: 'note' as const, id: n.id, value: n })),
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
  const baseline = { ...(meta.baseline as Record<string, string> | undefined) }
  const marchEntity = current('desktop:march')
  const priorMarch =
    marchEntity?.kind === 'desktop' && marchEntity.payload.type === 'march'
      ? marchEntity.payload.value
      : undefined
  const march = mobileMarch(priorMarch, entities).state
  const requested = docs
    .map((document) => ({ document, base: baseline[documentKey(document)] ?? null }))
    .filter((c) => strategy !== 'keep-both' || hash(c.document) !== c.base)
  const reply = JSON.parse(
    await exchange(
      JSON.stringify({
        protocol: 2,
        ...(strategy === 'keep-both' ? {} : { operation: 'sync-snapshot', strategy }),
        changes: requested,
        march
      })
    )
  ) as SyncReply
  if (
    reply.protocol !== 2 ||
    !Array.isArray(reply.documents) ||
    reply.documents.length > 10000 ||
    !Array.isArray(reply.conflicts)
  )
    throw Error('电脑响应格式不兼容')
  if (reply.march !== undefined) validateMarchState(reply.march)
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
      const value = { ...d.value, revision: (index < 0 ? 0 : journal.notes[index].revision) + 1 }
      if (index < 0) journal.notes.push(value)
      else journal.notes[index] = value
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
  const mergedMarch = reply.march ?? march
  if (!priorMarch || canonical(mergedMarch) !== canonical(priorMarch))
    save('desktop:march', { type: 'march', value: mergedMarch })
  save(metaId, {
    type: 'settings',
    value: { baseline, conflicts, lastSync: new Date().toISOString() }
  })
  await store.batch(commits)
  const attachments = { transferred: 0, pending: 0, errors: [] as string[] }
  const manifests = new Map(
    reply.documents
      .flatMap((d) => (d.kind === 'note' ? d.value.attachments : []))
      .map((a) => [a.id, a])
  )
  for (const a of manifests.values())
    try {
      const id = assetEntityId(a.id)
      const local = (await store.snapshot()).entities.find((e) => e.id === id)
      const data =
        local?.kind === 'desktop' && local.payload.type === 'settings'
          ? local.payload.value.data
          : undefined
      if (typeof data === 'string' && data) {
        const bytes = decodeAsset(data)
        if (bytes.length !== a.size) throw Error('本机附件大小不一致')
        const digest = assetHash(bytes)
        const probe = JSON.parse(
          await exchange(JSON.stringify({ operation: 'asset-probe', id: a.id }))
        )
        if (probe.exists) {
          if (probe.sha256 !== digest) throw Error('附件校验值不同，原文件均保留')
          continue
        }
        for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
          const response = JSON.parse(
            await exchange(
              JSON.stringify({
                operation: 'asset-write',
                id: a.id,
                offset,
                total: bytes.length,
                sha256: digest,
                data: encodeAsset(bytes.subarray(offset, offset + CHUNK_BYTES))
              })
            )
          )
          if (response.complete) break
          if (response.offset !== offset + Math.min(CHUNK_BYTES, bytes.length - offset))
            throw Error('附件上传未确认')
        }
        attachments.transferred++
      } else {
        if (a.size > MAX_ASSET_BYTES) throw Error('附件超过100MB')
        const bytes = new Uint8Array(a.size)
        let digest = ''
        for (let offset = 0; offset < a.size;) {
          const response = JSON.parse(
            await exchange(JSON.stringify({ operation: 'asset-read', id: a.id, offset }))
          )
          if (
            response.total !== a.size ||
            response.offset !== offset ||
            !/^[a-f0-9]{64}$/.test(response.sha256)
          )
            throw Error('附件响应不完整')
          if (digest && digest !== response.sha256) throw Error('附件在传输中发生变化')
          digest = response.sha256
          const chunk = decodeAsset(response.data)
          if (!chunk.length || chunk.length > CHUNK_BYTES || offset + chunk.length > a.size)
            throw Error('附件分块损坏')
          bytes.set(chunk, offset)
          offset += chunk.length
        }
        if (assetHash(bytes) !== digest) throw Error('附件校验失败')
        const entity = {
          ...newMeta(),
          id,
          kind: 'desktop' as const,
          version: (local?.version ?? 0) + 1,
          payload: {
            type: 'settings' as const,
            value: { data: encodeAsset(bytes), sha256: digest }
          }
        }
        await store.commit({
          entity,
          expectedVersion: local?.version ?? 0,
          operationId: crypto.randomUUID()
        })
        attachments.transferred++
      }
    } catch (error) {
      attachments.pending++
      attachments.errors.push(
        `${a.name}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  return {
    count: reply.documents.length,
    achievements: reply.march !== undefined,
    conflicts,
    attachments
  }
}
