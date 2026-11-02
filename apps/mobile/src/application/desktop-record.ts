import { z } from 'zod'
import { assertSessionData, actionSchema } from '@shared/contracts/state-schema'
import type { Session, SessionData, Version, ChatMessage, ActionItem } from '@shared/types'
import type { JournalState } from '@shared/journal'
export interface SessionRecord {
  session: Session
  versions: Version[]
  messages: ChatMessage[]
  receipts: Record<string, string>
  chatEpoch: number
}
const SOURCE_KEYS = ['bookId', 'revisionId', 'chapterId', 'paragraphId'] as const
/** Repair sources already saved by the mobile adapter that spread the entire book descriptor. */
export function normalizeSessionSources(data: SessionData): void {
  const sources = [
    ...data.readings.flatMap((reading) => [
      ...reading.passages.map((passage) => passage.source),
      ...reading.reflections.map((reflection) => reflection.source)
    ]),
    ...(data.diagnosis?.recommendations.map((rec) => rec.evidence?.source) ?? [])
  ]
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const record = source as unknown as Record<string, unknown>
    for (const key of Object.keys(record))
      if (!SOURCE_KEYS.includes(key as (typeof SOURCE_KEYS)[number])) delete record[key]
  }
}
export type DesktopPayload =
  | { type: 'action'; value: ActionItem }
  | { type: 'session'; value: SessionRecord }
  | { type: 'journal'; value: JournalState }
  | { type: 'settings'; value: Record<string, unknown> }
export const desktopPayloadSchema = z.custom<DesktopPayload>((v: unknown) => {
  if (!v || typeof v !== 'object') return false
  const p = v as DesktopPayload
  if (p.type === 'action') {
    try {
      actionSchema(p.value, 'action')
      return true
    } catch {
      return false
    }
  }
  if (p.type === 'session') {
    try {
      assertSessionData(p.value.session.data)
      p.value.versions.forEach((v) => assertSessionData(v.data))
      return (
        Array.isArray(p.value.messages) &&
        typeof p.value.chatEpoch === 'number' &&
        !!p.value.receipts &&
        Number.isInteger(p.value.session.stateVersion)
      )
    } catch {
      return false
    }
  }
  if (p.type === 'journal')
    return (
      Array.isArray(p.value.notes) &&
      Array.isArray(p.value.folders) &&
      p.value.notes.every((n) => typeof n.markdown === 'string' && Number.isInteger(n.revision))
    )
  return p.type === 'settings' && !!p.value && typeof p.value === 'object' && !('apiKey' in p.value)
}, '无效的桌面兼容数据')
