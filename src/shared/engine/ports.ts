import type { Settings, AIContext, Session } from '../types'
export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type CallJson = <T>(s: Settings, system: string, user: string) => Promise<T>
export type ContextAssertion = (
  session: Session,
  next: { _context?: AIContext } | null | undefined,
  old?: { _context?: AIContext } | null
) => void
