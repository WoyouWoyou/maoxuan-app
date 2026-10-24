import type { AIContext, Session, ThreeNotes } from '@shared/types'
import { array, object, text } from '@shared/contracts/validation'
import {
  diagnosisSchema,
  passageSchema,
  feedbackSchema,
  reviewSchema,
  mindsetSchema,
  notesSchema,
  problemSchema
} from '@shared/contracts/state-schema'
import { requireSession, listMessages } from '../sessions/public'
import { getChapter, scopeOf, titleMap } from '../library/public'
import { getSettings } from '../settings/public'
import { withModelContext } from '../model-runtime/public'
import * as profiles from './profiles'
import { createReadingContext, assertReadingContext } from './context'
async function generate<T>(
  id: string,
  purpose: string,
  run: (session: Session) => Promise<T>,
  attach: (result: T, ctx: AIContext) => void,
  articleId?: string
): Promise<T> {
  const session = requireSession(id)
  if (session.mode !== 'reading') throw new Error('阅读会话不存在')
  const ctx = createReadingContext(session, purpose, articleId)
  const result = await withModelContext({ purpose, sessionId: id, ...scopeOf(session.data) }, () =>
    run(session)
  )
  assertReadingContext(requireSession(id), { _context: ctx })
  attach(result, ctx)
  return result
}
function chapter(session: Session, id: string) {
  text(id, 'articleId')
  const article = getChapter(id, scopeOf(session.data))
  if (!article) throw new Error('文章不存在')
  return article
}
export const generateDiagnosis = (id: string) =>
  generate(
    id,
    'diagnose',
    async (s) => {
      const r = await profiles.diagnose(getSettings('reading'), s.data)
      diagnosisSchema(r, 'diagnosis')
      return r
    },
    (r, c) => {
      r._context = c
    }
  )
export const generateRevision = (id: string) =>
  generate(
    id,
    'reviseProblem',
    async (s) => {
      const r = await profiles.reviseProblem(
        getSettings('reading'),
        s.data,
        listMessages(id).slice(-30)
      )
      object({ problem: problemSchema, diagnosis: diagnosisSchema, changes: array(text) })(
        r,
        'revision'
      )
      return r
    },
    (r, c) => {
      r.diagnosis._context = c
    }
  )
export const generatePassages = (id: string, articleId: string) =>
  generate(
    id,
    'findPassages',
    async (s) => {
      const r = await profiles.findPassages(getSettings('reading'), s.data, chapter(s, articleId))
      object({ focusQuestion: text, passages: array(passageSchema) })(r, 'passages')
      return r
    },
    (r, c) => {
      for (const p of r.passages) p._context = c
    },
    articleId
  )
export const generateFeedback = (id: string, articleId: string, notes: ThreeNotes) =>
  generate(
    id,
    'reviewNotes',
    async (s) => {
      notesSchema(notes, 'notes')
      if (
        JSON.stringify(s.data.readings.find((r) => r.articleId === articleId)?.notes) !==
        JSON.stringify(notes)
      )
        throw new Error('请先保存当前笔记再获取反馈')
      const r = await profiles.reviewNotes(
        getSettings('reading'),
        s.data,
        chapter(s, articleId),
        notes
      )
      feedbackSchema(r, 'feedback')
      return r
    },
    (r, c) => {
      r._context = c
    },
    articleId
  )
export const generateReview = (id: string, situation: string) =>
  generate(
    id,
    'reviewSituation',
    async (s) => {
      text(situation, 'situation')
      const r = await profiles.reviewSituation(
        getSettings('reading'),
        s.data,
        situation,
        titleMap(scopeOf(s.data))
      )
      reviewSchema(r, 'review')
      return r
    },
    (r, c) => {
      r._context = c
    }
  )
export const generateMindset = (id: string) =>
  generate(
    id,
    'mindset',
    async (s) => {
      const r = await profiles.mindset(getSettings('reading'), s.data)
      mindsetSchema(r, 'mindset')
      return r
    },
    (r, c) => {
      r._context = c
    }
  )
