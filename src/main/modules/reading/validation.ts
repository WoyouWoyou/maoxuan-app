import { problemSignature } from './context'
import type { AIContext } from '@shared/types'
import type { SessionData } from '@shared/types'
import { getChapter, scopeOf } from '../library/public'
export function validateReadingData(previous: SessionData, nextData: SessionData): void {
  if (JSON.stringify(nextData.book ?? previous.book) !== JSON.stringify(previous.book))
    throw new Error('不能更换已创建问题的书籍，请新建问题')
  nextData.book = previous.book
  const verifyContext = (next: { _context?: AIContext } | null | undefined, old: unknown) => {
    if (!next?._context || JSON.stringify(next) === JSON.stringify(old)) return
    if (
      next._context.problemSignature !== problemSignature(previous) ||
      next._context.revisionId !== scopeOf(previous).revisionId
    )
      throw new Error('AI 结果已过时，请基于当前问题重新生成')
    // An explicitly confirmed problem revision becomes the new persisted context.
    next._context = { ...next._context, problemSignature: problemSignature(nextData) }
  }
  verifyContext(nextData.diagnosis, previous.diagnosis)
  verifyContext(nextData.mindset, previous.mindset)
  for (const review of nextData.reviews)
    verifyContext(
      review,
      previous.reviews.find((r) => r.id === review.id)
    )
  for (const reading of nextData.readings) {
    const oldReading = previous.readings.find((r) => r.articleId === reading.articleId)
    verifyContext(reading.feedback, oldReading?.feedback)
    for (const passage of reading.passages ?? [])
      verifyContext(
        passage,
        oldReading?.passages.find((p) => p.paragraphIndex === passage.paragraphIndex)
      )
    const chapter = getChapter(reading.articleId, scopeOf(previous))
    if (!chapter) throw new Error('引用章节不存在')
    for (const reflection of reading.reflections ?? []) {
      if (reflection.paragraphIndex !== null) {
        const i = reflection.paragraphIndex
        if (!Number.isInteger(i) || i < 0 || i >= chapter.paragraphs.length)
          throw new Error('感悟段落不存在')
        reflection.source = {
          ...scopeOf(previous),
          chapterId: chapter.id,
          paragraphId: chapter.paragraphIds![i]
        }
      }
    }
  }
  for (const action of nextData.actions)
    if (action.fromArticleId && !getChapter(action.fromArticleId, scopeOf(previous)))
      throw new Error('行动来源不存在')
  for (const review of nextData.reviews)
    for (const id of review.rereadArticleIds)
      if (!getChapter(id, scopeOf(previous))) throw new Error('重读来源不存在')
  for (const rec of nextData.diagnosis?.recommendations ?? [])
    if (!getChapter(rec.articleId, scopeOf(previous))) throw new Error('推荐章节不存在')
}
