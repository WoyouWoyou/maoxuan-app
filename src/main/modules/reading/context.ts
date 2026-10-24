import type { AIContext, Session, SessionData } from '@shared/types'
import {
  fingerprint,
  createSuggestionContext,
  assertSuggestionContext,
  listMessages
} from '../sessions/public'
export const problemSignature = (data: SessionData) => fingerprint(data.problem)
export function readingInput(data: SessionData, purpose: string, articleId?: string): unknown {
  const reading = data.readings.find((r) => r.articleId === articleId)
  switch (purpose) {
    case 'diagnose':
    case 'reviseProblem':
      return { problem: data.problem, diagnosis: data.diagnosis }
    case 'findPassages':
      return { problem: data.problem, articleId }
    case 'reviewNotes':
      return {
        problem: data.problem,
        diagnosis: data.diagnosis,
        articleId,
        notes: reading?.notes,
        reflections: reading?.reflections,
        passages: reading?.passages
      }
    case 'reviewSituation':
    case 'mindset':
      return {
        problem: data.problem,
        diagnosis: data.diagnosis,
        readings: data.readings,
        actions: data.actions,
        reviews: data.reviews
      }
    default:
      throw new Error('未知的阅读建议用途')
  }
}
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
