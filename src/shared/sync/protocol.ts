import { assertSessionData, actionSchema } from '../contracts/state-schema'
import type { Session, Version, ChatMessage } from '../types'
import type { JournalNote, JournalFolder } from '../journal'
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
  protocol: 1
  changes: { document: SyncDocument; base: string | null }[]
}
export interface SyncReply {
  protocol: 1
  documents: SyncDocument[]
  conflicts: string[]
}
export interface SyncStatus {
  running: boolean
  pairing: string[]
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
    if (n.attachments.length) throw Error('暂不支持附件同步，请先保留有附件的记录在原设备')
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
/** No timestamp ordering; divergent edits stay on both devices until explicitly resolved. */
export function reconcile(
  current: SyncDocument[],
  request: SyncRequest,
  hash: (v: unknown) => string
): SyncReply {
  if (request?.protocol !== 1 || !Array.isArray(request.changes) || request.changes.length > 10000)
    throw Error('不支持的同步协议')
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
    else conflicts.push(key)
  }
  return { protocol: 1, documents: [...docs.values()], conflicts }
}
