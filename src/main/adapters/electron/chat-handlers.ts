import { ipcMain } from 'electron'
import { validateIpcArguments } from '@shared/contracts/ipc'
import { listMessages, clearChat, sendChat } from '../../modules/chat/public'
import { register, toError } from './transport'
export function registerChatHandlers(): void {
  register('chat:list', listMessages)
  register('chat:clear', clearChat)
  ipcMain.handle('chat:send', (event, id: string, content: string, articleId?: string | null) => {
    try {
      validateIpcArguments('chat:send', [id, content, articleId])
      const emit = (channel: string, payload: unknown) => {
        if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
      }
      return sendChat(id, content, articleId, {
        chunk: (e) => emit('chat:chunk', e),
        done: (e) => emit('chat:done', e),
        error: (e) => emit('chat:error', e)
      })
    } catch (error) {
      throw toError(error)
    }
  })
}
