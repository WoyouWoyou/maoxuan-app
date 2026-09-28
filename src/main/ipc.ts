import { ipcMain, type WebContents } from 'electron'
import { randomUUID } from 'crypto'
import type {
  Article,
  ChatChunkEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatMessage,
  Session,
  SessionPatch,
  Settings,
  ThreeNotes
} from '@shared/types'
import {
  addMessage,
  archiveSession,
  clearMessages,
  createSession,
  emptyTrash,
  getSession,
  getSettings,
  getVersion,
  listArchivedSessions,
  listMessages,
  listSessions,
  listTrashSessions,
  listVersions,
  removeSession,
  restoreSession,
  restoreVersion,
  setSettings,
  trashSession,
  unarchiveSession,
  updateSession
} from './db'
import { articleTitleMap, getArticle, listArticles, searchArticles } from './articles'
import {
  buildChatMessages,
  diagnose,
  findPassages,
  mindset,
  reviewNotes,
  reviewSituation,
  reviseProblem
} from './coach'
import { streamChat, testConnection } from './ai'

function toError(error: unknown): Error {
  if (error instanceof Error) return new Error(error.message)
  return new Error(String(error))
}

function register<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<TResult> => {
    try {
      return await handler(...(args as unknown as TArgs))
    } catch (error) {
      throw toError(error)
    }
  })
}

function requireSession(id: string): Session {
  const session = getSession(id)
  if (!session) throw new Error('会话不存在')
  return session
}

function requireArticle(id: string): Article {
  const article = getArticle(id)
  if (!article) throw new Error('文章不存在')
  return article
}

async function runChat(
  sender: WebContents,
  requestId: string,
  sessionId: string,
  userMessageId: string,
  userContent: string,
  articleId: string | null
): Promise<void> {
  const send = <T>(channel: string, payload: T): void => {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  }

  try {
    const session = requireSession(sessionId)
    const history = listMessages(sessionId)
      .filter((message) => message.id !== userMessageId)
      .slice(-20)
    const article = articleId ? getArticle(articleId) : null
    const messages = buildChatMessages(session.data, history, userContent, article)
    const full = await streamChat(getSettings(), messages, (delta) => {
      send<ChatChunkEvent>('chat:chunk', { requestId, delta })
    })
    const message = addMessage(sessionId, 'assistant', full, articleId)
    send<ChatDoneEvent>('chat:done', { requestId, message })
  } catch (error) {
    send<ChatErrorEvent>('chat:error', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export function registerIpc(): void {
  register<[], ReturnType<typeof listArticles>>('articles:list', () => listArticles())
  register<[string], Article | null>('articles:get', (id) => getArticle(id))
  register<[string, number | undefined], ReturnType<typeof searchArticles>>(
    'articles:search',
    (query, limit) => searchArticles(query, limit)
  )

  register<[], ReturnType<typeof listSessions>>('sessions:list', () => listSessions())
  register<[], ReturnType<typeof listArchivedSessions>>('sessions:listArchived', () => listArchivedSessions())
  register<[], ReturnType<typeof listTrashSessions>>('sessions:listTrash', () => listTrashSessions())
  register<[string], Session | null>('sessions:get', (id) => getSession(id))
  register<[string], Session>('sessions:create', (problemText) => createSession(problemText))
  register<[string, SessionPatch, string | undefined], Session>(
    'sessions:update',
    (id, patch, versionLabel) => updateSession(id, patch, versionLabel)
  )
  register<[string], void>('sessions:remove', (id) => {
    removeSession(id)
  })
  register<[string], void>('sessions:archive', (id) => {
    archiveSession(id)
  })
  register<[string], void>('sessions:unarchive', (id) => {
    unarchiveSession(id)
  })
  register<[string], void>('sessions:trash', (id) => {
    trashSession(id)
  })
  register<[string], void>('sessions:restore', (id) => {
    restoreSession(id)
  })
  register<[], number>('sessions:emptyTrash', () => emptyTrash())

  register<[string], ReturnType<typeof listVersions>>('versions:list', (sessionId) => listVersions(sessionId))
  register<[string], ReturnType<typeof getVersion>>('versions:get', (versionId) => getVersion(versionId))
  register<[string], Session>('versions:restore', (versionId) => restoreVersion(versionId))

  register<[string], ChatMessage[]>('chat:list', (sessionId) => listMessages(sessionId))
  register<[string], void>('chat:clear', (sessionId) => {
    clearMessages(sessionId)
  })

  ipcMain.handle(
    'chat:send',
    async (
      event,
      sessionId: string,
      content: string,
      articleId?: string | null
    ): Promise<{ requestId: string; userMessage: ChatMessage }> => {
      try {
        requireSession(sessionId)
        const resolvedArticleId = articleId ?? null
        const userMessage = addMessage(sessionId, 'user', content, resolvedArticleId)
        const requestId = randomUUID()
        void runChat(event.sender, requestId, sessionId, userMessage.id, content, resolvedArticleId)
        return { requestId, userMessage }
      } catch (error) {
        throw toError(error)
      }
    }
  )

  register<[string], ReturnType<typeof diagnose>>('ai:diagnose', async (sessionId) => {
    const session = requireSession(sessionId)
    return diagnose(getSettings(), session.data)
  })

  register<[string], ReturnType<typeof reviseProblem>>('ai:reviseProblem', async (sessionId) => {
    const session = requireSession(sessionId)
    const messages = listMessages(sessionId).slice(-30)
    return reviseProblem(getSettings(), session.data, messages)
  })

  register<[string, string], ReturnType<typeof findPassages>>('ai:findPassages', async (sessionId, articleId) => {
    const session = requireSession(sessionId)
    const article = requireArticle(articleId)
    return findPassages(getSettings(), session.data, article)
  })

  register<[string, string, ThreeNotes], ReturnType<typeof reviewNotes>>(
    'ai:reviewNotes',
    async (sessionId, articleId, notes) => {
      const session = requireSession(sessionId)
      const article = requireArticle(articleId)
      return reviewNotes(getSettings(), session.data, article, notes)
    }
  )

  register<[string, string], ReturnType<typeof reviewSituation>>(
    'ai:reviewSituation',
    async (sessionId, newSituation) => {
      const session = requireSession(sessionId)
      return reviewSituation(getSettings(), session.data, newSituation, articleTitleMap())
    }
  )

  register<[string], ReturnType<typeof mindset>>('ai:mindset', async (sessionId) => {
    const session = requireSession(sessionId)
    return mindset(getSettings(), session.data)
  })

  register<[], Settings>('settings:get', () => getSettings())
  register<[Settings], Settings>('settings:set', (settings) => setSettings(settings))
  register<[], { ok: boolean; message: string }>('settings:test', () => {
    try {
      return testConnection(getSettings())
    } catch (error) {
      throw toError(error)
    }
  })
}
