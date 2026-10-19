import type { ThreeNotes } from '@shared/types'
import { getSettings, listMessages } from '../sqlite/session-repository'
import { scopeOf, titleMap as articleTitleMap } from '../../modules/library/public'
import {
  diagnose,
  reviseProblem,
  findPassages,
  reviewNotes,
  reviewSituation,
  mindset
} from '../../modules/reading/public'
import { register, requireSession, requireArticle, requireWorkbench, toError } from './transport'
export function registerReadingHandlers(): void {
  register<[string], ReturnType<typeof diagnose>>('ai:diagnose', async (sessionId) => {
    const session = requireSession(sessionId)
    return diagnose(getSettings('reading'), session.data)
  })

  register<[string], ReturnType<typeof reviseProblem>>('ai:reviseProblem', async (sessionId) => {
    const session = requireSession(sessionId)
    const messages = listMessages(sessionId).slice(-30)
    return reviseProblem(getSettings('reading'), session.data, messages)
  })

  register<[string, string], ReturnType<typeof findPassages>>(
    'ai:findPassages',
    async (sessionId, articleId) => {
      const session = requireSession(sessionId)
      const article = requireArticle(articleId, scopeOf(session.data))
      return findPassages(getSettings('reading'), session.data, article)
    }
  )

  register<[string, string, ThreeNotes], ReturnType<typeof reviewNotes>>(
    'ai:reviewNotes',
    async (sessionId, articleId, notes) => {
      const session = requireSession(sessionId)
      const article = requireArticle(articleId, scopeOf(session.data))
      return reviewNotes(getSettings('reading'), session.data, article, notes)
    }
  )

  register<[string, string], ReturnType<typeof reviewSituation>>(
    'ai:reviewSituation',
    async (sessionId, newSituation) => {
      const session = requireSession(sessionId)
      return reviewSituation(
        getSettings('reading'),
        session.data,
        newSituation,
        articleTitleMap(scopeOf(session.data))
      )
    }
  )

  register<[string], ReturnType<typeof mindset>>('ai:mindset', async (sessionId) => {
    const session = requireSession(sessionId)
    return mindset(getSettings('reading'), session.data)
  })
}
