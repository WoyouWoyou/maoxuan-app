import type { SessionData } from '@shared/types'
export function readingInput(data: SessionData, purpose: string, articleId?: string): unknown {
  const reading = data.readings.find((r) => r.articleId === articleId)
  switch (purpose) {
    case 'diagnose':
    case 'reviseProblem':
      return { problem: data.problem, diagnosis: data.diagnosis }
    case 'findPassages':
      return { problem: data.problem, articleId }
    case 'draftNotes':
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
