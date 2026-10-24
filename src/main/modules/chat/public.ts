import { randomUUID } from 'node:crypto'
import type { ChatChunkEvent, ChatDoneEvent, ChatErrorEvent, Session } from '@shared/types'
import { getSettings } from '../settings/public'
import { requireSession, listMessages, addMessage, clearMessages } from '../sessions/public'
import { buildChatMessages } from '../reading/public'
import { buildWbChatMessages } from '../workbench/public'
import { getChapter, scopeOf } from '../library/public'
import { streamChat, withModelContext } from '../model-runtime/public'
import { nullable, optional, text } from '@shared/contracts/validation'
export { listMessages } from '../sessions/public'
interface ChatEvents {
  chunk(event: ChatChunkEvent): void
  done(event: ChatDoneEvent): void
  error(event: ChatErrorEvent): void
}
function chapter(session: Session, id: string | null) {
  if (!id) return null
  const source = getChapter(id, scopeOf(session.data))
  if (!source) throw new Error('文章不存在')
  return source
}
async function run(
  session: Session,
  userMessageId: string,
  content: string,
  articleId: string | null,
  requestId: string,
  events: ChatEvents
): Promise<void> {
  try {
    const history = listMessages(session.id)
      .filter((m) => m.id !== userMessageId)
      .slice(-20)
    const article = chapter(session, articleId)
    const messages =
      session.mode === 'workbench' && session.data.workbench
        ? buildWbChatMessages(session.data.workbench, history, content)
        : buildChatMessages(session.data, history, content, article)
    const result = await withModelContext(
      {
        purpose: session.mode === 'workbench' ? 'workbench_chat' : 'chat',
        sessionId: session.id,
        ...scopeOf(session.data)
      },
      () =>
        streamChat(
          getSettings(session.mode === 'workbench' ? 'workbench' : 'reading'),
          messages,
          (delta) => events.chunk({ requestId, delta })
        )
    )
    if (!listMessages(session.id).some((m) => m.id === userMessageId))
      throw new Error('对话已清空，本次回复未保存')
    const message = addMessage(session.id, 'assistant', result, articleId)
    events.done({ requestId, message })
  } catch (error) {
    events.error({ requestId, error: error instanceof Error ? error.message : String(error) })
  }
}
export function sendChat(
  id: string,
  content: string,
  articleId: string | null | undefined,
  events: ChatEvents
) {
  text(content, 'content')
  optional(nullable(text))(articleId, 'articleId')
  const session = requireSession(id),
    sourceId = articleId ?? null
  chapter(session, sourceId)
  const userMessage = addMessage(id, 'user', content, sourceId),
    requestId = randomUUID()
  void run(session, userMessage.id, content, sourceId, requestId, events)
  return { requestId, userMessage }
}
export const clearChat = (id: string) => clearMessages(id)
