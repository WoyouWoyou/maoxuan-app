import { ipcMain, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ChatMessage, ChatChunkEvent, ChatDoneEvent, ChatErrorEvent } from '@shared/types'
import { getSettings, listMessages, addMessage, clearMessages } from '../sqlite/session-repository'
import { buildChatMessages } from '../../modules/reading/public'
import { buildWbChatMessages } from '../../modules/workbench/public'
import { scopeOf } from '../../modules/library/public'
import { streamChat, withModelContext } from '../../modules/model-runtime/public'
import { register, requireSession, requireArticle, requireWorkbench, toError } from './transport'
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
    const article = articleId ? requireArticle(articleId, scopeOf(session.data)) : null
    const messages =
      session.mode === 'workbench' && session.data.workbench
        ? buildWbChatMessages(session.data.workbench, history, userContent)
        : buildChatMessages(session.data, history, userContent, article)
    const full = await withModelContext(
      {
        purpose: session.mode === 'workbench' ? 'workbench_chat' : 'chat',
        sessionId,
        ...scopeOf(session.data)
      },
      () =>
        streamChat(
          getSettings(session.mode === 'workbench' ? 'workbench' : 'reading'),
          messages,
          (delta) => {
            send<ChatChunkEvent>('chat:chunk', { requestId, delta })
          }
        )
    )
    const message = addMessage(sessionId, 'assistant', full, articleId)
    send<ChatDoneEvent>('chat:done', { requestId, message })
  } catch (error) {
    send<ChatErrorEvent>('chat:error', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export function registerChatHandlers(): void {
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
        const session = requireSession(sessionId)
        if (articleId) requireArticle(articleId, scopeOf(session.data))
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
}
