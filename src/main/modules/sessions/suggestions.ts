import { createHash, randomUUID } from 'node:crypto'
import type { AIContext, Session } from '@shared/types'
/** Fingerprints exclude provenance, which does not change the user's input. */
export function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, (key, value) => (key === '_context' ? undefined : value)))
    .digest('hex')
}
export function createSuggestionContext(
  session: Session,
  purpose: string,
  input: unknown,
  articleId?: string
): AIContext {
  return {
    requestId: randomUUID(),
    sessionId: session.id,
    purpose,
    articleId,
    profileVersion: session.data.book?.profileVersion ?? '1',
    problemSignature: fingerprint(session.data.problem),
    revisionId: session.data.book?.revisionId ?? 'maoxuan-v1',
    inputSignature: fingerprint(input)
  }
}
export function assertSuggestionContext(
  session: Session,
  value: { _context?: AIContext } | null | undefined,
  old?: { _context?: AIContext } | null,
  input?: unknown
): void {
  const ctx = value?._context
  if (!ctx || JSON.stringify(value) === JSON.stringify(old)) return
  // Subsequent user edits of an already accepted result preserve its provenance.
  if (
    ctx.requestId &&
    ctx.requestId === old?._context?.requestId &&
    JSON.stringify(ctx) === JSON.stringify(old?._context)
  )
    return
  if (ctx.sessionId && ctx.sessionId !== session.id) throw new Error('AI 结果不属于当前会话')
  if (
    ctx.revisionId !== (session.data.book?.revisionId ?? 'maoxuan-v1') ||
    ctx.problemSignature !== fingerprint(session.data.problem) ||
    (ctx.profileVersion && ctx.profileVersion !== (session.data.book?.profileVersion ?? '1')) ||
    (ctx.inputSignature && ctx.inputSignature !== fingerprint(input))
  )
    throw new Error('AI 结果已过时，请基于当前内容重新生成')
}
