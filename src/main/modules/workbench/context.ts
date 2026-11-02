import type { AIContext, Session, SessionData } from '@shared/types'
import { createSuggestionContext, assertSuggestionContext } from '../sessions/public'
import { workbenchInput } from '@shared/engine/workbench-input'
export { workbenchInput } from '@shared/engine/workbench-input'
export const createWorkbenchContext = (s: Session, purpose: string) =>
  createSuggestionContext(s, purpose, workbenchInput(s.data, purpose))
export function assertWorkbenchContext(
  s: Session,
  value: { _context?: AIContext } | null | undefined,
  old?: { _context?: AIContext } | null
) {
  const ctx = value?._context
  assertSuggestionContext(
    s,
    value,
    old,
    ctx?.purpose ? workbenchInput(s.data, ctx.purpose) : undefined
  )
}
