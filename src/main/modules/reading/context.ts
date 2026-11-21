import type { AIContext, Session, SessionData } from '@shared/types'
import {
  fingerprint,
  createSuggestionContext,
  assertSuggestionContext,
  listMessages
} from '../sessions/public'
export const problemSignature = (data: SessionData) => fingerprint(data.problem)
import { readingInput } from '@shared/engine/reading-input'
export { readingInput } from '@shared/engine/reading-input'
export function createReadingContext(s: Session, purpose: string, articleId?: string) {
  const ctx = createSuggestionContext(
    s,
    purpose,
    readingInput(s.data, purpose, articleId),
    articleId
  )
  if (purpose === 'reviseProblem')
    ctx.conversationSignature = fingerprint(listMessages(s.id).slice(-30))
  return ctx
}
export function assertReadingContext(
  s: Session,
  value: { _context?: AIContext } | null | undefined,
  old?: { _context?: AIContext } | null
) {
  const ctx = value?._context
  if (
    ctx?.conversationSignature &&
    ctx.requestId !== old?._context?.requestId &&
    ctx.conversationSignature !== fingerprint(listMessages(s.id).slice(-30))
  )
    throw new Error('讨论已变化，请重新生成问题修订建议')
  assertSuggestionContext(
    s,
    value,
    old,
    ctx?.purpose ? readingInput(s.data, ctx.purpose, ctx.articleId) : undefined
  )
}
