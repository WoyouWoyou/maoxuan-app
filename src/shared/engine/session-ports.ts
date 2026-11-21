import type { ChatMessage, Session, SessionSummary, Version, VersionSummary } from '@shared/types'
export interface SessionRepository {
  transaction<T>(work: () => T): T
  get(id: string): Session | null
  list(filter: 'active' | 'archived' | 'trash'): SessionSummary[]
  insert(session: Session): void
  save(session: Session): void
  delete(id: string): void
  purge(deadline?: string): number
  versions(id: string): VersionSummary[]
  version(id: string): Version | null
  snapshot(version: Version): void
  receipt(id: string, mutationId: string): string | undefined
  remember(id: string, mutationId: string, signature: string): void
  messages(id: string): ChatMessage[]
  addMessage(message: ChatMessage): void
  clearMessages(id: string): void
}
