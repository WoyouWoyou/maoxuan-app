import { assertSessionData, actionSchema } from '../contracts/state-schema'
import type { Session, Version, ChatMessage } from '../types'
import type { JournalNote, JournalFolder } from '../journal'
import type { MarchState } from './march'

export const SYNC_STRATEGIES = ['keep-both', 'latest', 'prefer-phone', 'prefer-desktop'] as const
export type SyncStrategy = (typeof SYNC_STRATEGIES)[number]

export const DISCOVERY_PORT = 43571
export const DISCOVERY_PROBE = 'maoxuan-sync-discovery-v1'
export interface SyncPeer {
  id: string
  name: string
  url: string
  fingerprint: string
}
export interface SessionTransfer {
  session: Session
  versions: Version[]
  messages: ChatMessage[]
}
export type SyncDocument =
  | { id: string; kind: 'session'; value: SessionTransfer }
  | { id: string; kind: 'note'; value: JournalNote }
  | { id: string; kind: 'folder'; value: JournalFolder }
  | { id: string; kind: 'action'; value: import('../types').ActionItem }
export interface SyncRequest {
  protocol: 2
  operation?: 'sync-snapshot'
  strategy?: SyncStrategy
  march?: MarchState
  changes: { document: SyncDocument; base: string | null }[]
}
export interface SyncReply {
  protocol: 2
  documents: SyncDocument[]
  conflicts: string[]
  march?: MarchState
}
export interface SyncStatus {
  running: boolean
  device?: SyncPeer
  discoveryError?: string
  error?: string
}
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return (
    '{' +
    Object.keys(value)
      .filter(
        (k) =>
          (value as Record<string, unknown>)[k] !== undefined &&
          !['stateVersion', 'versionNo', 'revision'].includes(k)
      )
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          canonical(
            ['versions', 'messages'].includes(k) &&
              Array.isArray((value as Record<string, unknown>)[k])
              ? [...((value as Record<string, unknown>)[k] as { id: string }[])].sort((a, b) =>
                  a.id.localeCompare(b.id)
                )
              : (value as Record<string, unknown>)[k]
          )
      )
      .join(',') +
    '}'
  )
}
export function validateDocument(d: SyncDocument): void {
  if (!d || typeof d.id !== 'string' || !d.id || d.id.length > 180 || !d.value)
    throw Error('无效同步实体')
  if (d.kind === 'session') {
    const s = d.value.session
    if (
      s?.id !== d.id ||
      typeof s.title !== 'string' ||
      typeof s.createdAt !== 'string' ||
      typeof s.updatedAt !== 'string' ||
      ![
        'problem',
        'focus',
        'relate',
        'apply',
        'wb_intake',
        'wb_diagnose',
        'wb_decide',
        'wb_act'
      ].includes(s.currentStep) ||
      !['reading', 'workbench'].includes(s.mode) ||
      !['active', 'archived'].includes(s.status) ||
      !Number.isInteger(s.stateVersion) ||
      !Array.isArray(d.value.versions) ||
      !Array.isArray(d.value.messages)
    )
      throw Error('无效会话')
    assertSessionData(s.data)
    s.bookId = s.data.book?.bookId ?? 'maoxuan'
    s.bookTitle = s.data.book?.title ?? '毛泽东选集'
    if (s.data.book && s.data.book.bookId !== 'maoxuan')
      throw Error('暂不支持导入书籍的会话同步，请保留原设备数据')
    for (const v of d.value.versions) {
      if (v.sessionId !== d.id || typeof v.id !== 'string' || !Number.isInteger(v.versionNo))
        throw Error('无效版本')
      assertSessionData(v.data)
    }
    for (const m of d.value.messages)
      if (
        m.sessionId !== d.id ||
        typeof m.id !== 'string' ||
        typeof m.content !== 'string' ||
        !['user', 'assistant', 'system'].includes(m.role)
      )
        throw Error('无效对话')
  } else if (d.kind === 'action') {
    actionSchema(d.value, 'action')
    if (d.value.id !== d.id) throw Error('行动ID不一致')
  } else if (d.kind === 'note') {
    const n = d.value
    if (
      n.id !== d.id ||
      typeof n.title !== 'string' ||
      typeof n.markdown !== 'string' ||
      n.markdown.length > 5e6 ||
      !Number.isInteger(n.revision) ||
      !Array.isArray(n.tags) ||
      !n.tags.every((x) => typeof x === 'string') ||
      !Array.isArray(n.attachments) ||
      typeof n.deleted !== 'boolean' ||
      typeof n.createdAt !== 'string' ||
      typeof n.updatedAt !== 'string' ||
      !(n.folderId === null || typeof n.folderId === 'string')
    )
      throw Error('无效Markdown记录')
    for (const a of n.attachments)
      if (
        !/^[a-f0-9-]{36}$/.test(a.id) ||
        typeof a.name !== 'string' ||
        !/^(image\/(png|jpeg|webp|gif)|audio\/(webm|ogg|mp4|mpeg|wav))$/.test(a.mime) ||
        !Number.isInteger(a.size) ||
        a.size < 16 ||
        a.size > 100 * 1024 * 1024
      )
        throw Error('无效附件清单')
  } else if (d.kind === 'folder') {
    const f = d.value
    if (
      f.id !== d.id ||
      typeof f.name !== 'string' ||
      !(f.parentId === null || typeof f.parentId === 'string') ||
      typeof f.archived !== 'boolean' ||
      typeof f.deleted !== 'boolean'
    )
      throw Error('无效文件夹')
  } else throw Error('未知同步实体')
}
export const documentKey = (d: SyncDocument) => `${d.kind}:${d.id}`
/** A deterministic user-editable copy; retries preserve identity instead of multiplying copies. */
export function conflictCopy(
  document: SyncDocument,
  hash: (v: unknown) => string,
  salt = ''
): SyncDocument {
  const d = structuredClone(document)
  const id = 'sync-conflict:' + hash({ document, salt })
  d.id = id
  if (d.kind === 'session') {
    d.value.session.id = id
    d.value.session.title += '（同步冲突副本）'
    d.value.versions = d.value.versions.map((v) => ({
      ...v,
      id: 'sync-conflict:' + hash({ owner: id, version: v.id }),
      sessionId: id
    }))
    d.value.messages = d.value.messages.map((m) => ({
      ...m,
      id: 'sync-conflict:' + hash({ owner: id, message: m.id }),
      sessionId: id
    }))
  } else {
    d.value.id = id
    if (d.kind === 'note') d.value.title += '（同步冲突副本）'
    if (d.kind === 'action') d.value.text += '（同步冲突副本）'
    if (d.kind === 'folder') d.value.name += '（同步冲突副本）'
  }
  return d
}
function modifiedAt(d: SyncDocument): number {
  if (d.kind === 'session')
    return Math.max(
      Date.parse(d.value.session.updatedAt) || 0,
      Date.parse(d.value.session.deletedAt ?? '') || 0
    )
  if (d.kind === 'note') return Date.parse(d.value.updatedAt) || 0
  if (d.kind === 'action')
    return (
      Date.parse(d.value.updatedAt ?? d.value.progress.at(-1)?.createdAt ?? d.value.createdAt) || 0
    )
  return 0
}

function mergeSessionHistory(winner: SyncDocument, other: SyncDocument): SyncDocument {
  if (winner.kind !== 'session' || other.kind !== 'session') return winner
  const versions = new Map(
    [...other.value.versions, ...winner.value.versions].map((v) => [v.id, v])
  )
  return { ...winner, value: { ...winner.value, versions: [...versions.values()] } }
}

/** Same-title notes in one folder and sessions of one mode are moved to trash if older. */
function removeOlderNames(docs: Map<string, SyncDocument>): void {
  const groups = new Map<string, SyncDocument[]>()
  for (const d of docs.values()) {
    if (d.id.startsWith('sync-conflict:')) continue
    const scope =
      d.kind === 'note' && !d.value.deleted
        ? [d.value.folderId, d.value.title]
        : d.kind === 'session' && !d.value.session.deletedAt
          ? [d.value.session.mode, d.value.session.title]
          : undefined
    const title = scope?.[1]?.trim().normalize('NFC')
    if (!scope || !title) continue
    const key = JSON.stringify([d.kind, scope[0], title])
    const group = groups.get(key) ?? []
    group.push(d)
    groups.set(key, group)
  }
  const deletedAt = new Date().toISOString()
  for (const group of groups.values()) {
    const latest = Math.max(...group.map(modifiedAt))
    for (const d of group) {
      if (modifiedAt(d) >= latest) continue
      if (d.kind === 'note')
        docs.set(documentKey(d), { ...d, value: { ...d.value, deleted: true } })
      if (d.kind === 'session')
        docs.set(documentKey(d), {
          ...d,
          value: {
            ...d.value,
            session: { ...d.value.session, deletedAt }
          }
        })
    }
  }
}

export function reconcile(
  current: SyncDocument[],
  request: SyncRequest,
  hash: (v: unknown) => string
): SyncReply {
  if (request?.protocol !== 2 || !Array.isArray(request.changes) || request.changes.length > 10000)
    throw Error('不支持的同步协议')
  const strategy = request.strategy ?? 'keep-both'
  if (
    !SYNC_STRATEGIES.includes(strategy) ||
    (strategy !== 'keep-both' && request.operation !== 'sync-snapshot')
  )
    throw Error('无效同步规则')
  const docs = new Map(current.map((d) => [documentKey(d), d]))
  const conflicts: string[] = []
  const seen = new Set<string>()
  for (const { document: d, base } of request.changes) {
    validateDocument(d)
    const key = documentKey(d)
    if (seen.has(key)) throw Error('重复同步实体')
    seen.add(key)
    if (base !== null && (typeof base !== 'string' || !/^[a-f0-9]{64}$/.test(base)))
      throw Error('无效基础版本')
    const prior = docs.get(key)
    if (prior && hash(prior) === hash(d)) continue
    if (strategy === 'prefer-phone' || strategy === 'prefer-desktop') {
      docs.set(
        key,
        prior
          ? strategy === 'prefer-phone'
            ? mergeSessionHistory(d, prior)
            : mergeSessionHistory(prior, d)
          : d
      )
      continue
    }
    if (strategy === 'latest') {
      // Full snapshots include unchanged phone records so same-name matches can be found.
      if (hash(d) === base) continue
      if (prior && hash(prior) !== base && modifiedAt(d) !== modifiedAt(prior)) {
        docs.set(
          key,
          modifiedAt(d) > modifiedAt(prior)
            ? mergeSessionHistory(d, prior)
            : mergeSessionHistory(prior, d)
        )
        continue
      }
    }
    if (
      prior?.kind === 'session' &&
      d.kind === 'session' &&
      hash({ ...prior, value: { ...prior.value, versions: [] } }) ===
        hash({ ...d, value: { ...d.value, versions: [] } })
    ) {
      const versions = new Map([...prior.value.versions, ...d.value.versions].map((v) => [v.id, v]))
      docs.set(key, { ...prior, value: { ...prior.value, versions: [...versions.values()] } })
      continue
    }
    if (prior ? hash(prior) === base : base === null) docs.set(key, d)
    else {
      let copy = conflictCopy(d, hash)
      while (docs.has(documentKey(copy)) && hash(docs.get(documentKey(copy))) !== hash(copy))
        copy = conflictCopy(d, hash, hash(docs.get(documentKey(copy))))
      docs.set(documentKey(copy), copy)
      conflicts.push(key)
    }
  }
  if (strategy === 'latest') removeOlderNames(docs)
  return { protocol: 2, documents: [...docs.values()], conflicts }
}
