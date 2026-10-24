import { stepUnlocked } from '@shared/reading-rules'
import type { AIContext, Session, SessionData, Article, StepKey } from '@shared/types'
import { getChapter, scopeOf } from '../library/public'
import { fingerprint } from '../sessions/public'
import { assertReadingContext, readingInput } from './context'
export function validateReadingSession(
  session: Session,
  nextData: SessionData,
  restoring = false,
  step?: StepKey
): void {
  const previous = session.data
  if (!restoring && step && step !== session.currentStep) {
    const gate = stepUnlocked(nextData, step)
    if (!gate.ok) throw new Error(gate.reason || '阅读步骤无效')
  }
  const verifyContext = (
    next: { _context?: AIContext } | null | undefined,
    old?: { _context?: AIContext } | null
  ) => {
    if (!restoring) assertReadingContext(session, next, old)
  }
  verifyContext(nextData.diagnosis, previous.diagnosis)
  verifyContext(nextData.mindset, previous.mindset)
  const cache = new Map<string, Article>()
  function chapter(id: string) {
    if (!cache.has(id)) {
      const c = getChapter(id, scopeOf(previous))
      if (!c) throw new Error('引用章节不存在')
      cache.set(id, c)
    }
    return cache.get(id)!
  }
  function source(c: Article, index: number, quote?: string) {
    if (!Number.isInteger(index) || index < 0 || index >= c.paragraphs.length)
      throw new Error('引用段落不存在')
    if (quote !== undefined && (!quote || !c.paragraphs[index].includes(quote)))
      throw new Error('引用与原文不一致')
    return { ...scopeOf(previous), chapterId: c.id, paragraphId: c.paragraphIds![index] }
  }
  const unique = (ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error('记录标识重复')
  }
  unique(nextData.readings.map((r) => r.articleId))
  unique(nextData.actions.map((a) => a.id))
  unique(nextData.reviews.map((r) => r.id))
  for (const reading of nextData.readings) {
    const old = previous.readings.find((r) => r.articleId === reading.articleId),
      c = chapter(reading.articleId)
    // A chapter title is source metadata, never a client supplied fact.
    reading.title = c.title
    verifyContext(reading.feedback, old?.feedback)
    const ctx = reading.feedback?._context
    if (!restoring && ctx?.requestId && ctx.requestId !== old?.feedback?._context?.requestId) {
      if (
        ctx.articleId !== reading.articleId ||
        ctx.purpose !== 'reviewNotes' ||
        ctx.inputSignature !== fingerprint(readingInput(nextData, 'reviewNotes', reading.articleId))
      )
        throw new Error('笔记反馈已过时或不属于当前章节')
    }
    if (reading.feedback) for (const i of reading.feedback.rereadParagraphs) source(c, i)
    unique(reading.reflections.map((r) => r.id))
    unique(reading.passages.map((p) => String(p.paragraphIndex)))
    for (const p of reading.passages) {
      verifyContext(
        p,
        old?.passages.find((x) => x.paragraphIndex === p.paragraphIndex)
      )
      p.source = source(c, p.paragraphIndex, p.quote)
    }
    for (const r of reading.reflections) {
      if (r.paragraphIndex !== null) r.source = source(c, r.paragraphIndex, r.quote || undefined)
      else delete r.source
    }
  }
  for (const action of nextData.actions) {
    if (action.fromArticleId) chapter(action.fromArticleId)
    unique(action.progress.map((p) => p.id))
  }
  for (const review of nextData.reviews) {
    verifyContext(
      review,
      previous.reviews.find((r) => r.id === review.id)
    )
    for (const id of review.rereadArticleIds) chapter(id)
  }
  for (const rec of nextData.diagnosis?.recommendations ?? []) {
    const c = chapter(rec.articleId)
    rec.title = c.title
    if (rec.evidence)
      rec.evidence.source = source(c, rec.evidence.paragraphIndex, rec.evidence.quote)
  }
}
