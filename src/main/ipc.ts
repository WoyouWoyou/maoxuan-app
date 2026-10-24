import {
  classifyActions,
  listActions,
  createAction,
  editAction
} from './modules/action-planning/public'
import { register } from './adapters/electron/transport'
import { registerSpeechHandlers } from './adapters/electron/speech-handlers'
import { registerLibraryHandlers } from './adapters/electron/library-handlers'
import { getSettings } from './modules/settings/public'
import { registerArticleHandlers } from './adapters/electron/article-handlers'
import { registerSessionHandlers } from './adapters/electron/session-handlers'
import { registerReadingHandlers } from './adapters/electron/reading-handlers'
import { registerWorkbenchHandlers } from './adapters/electron/workbench-handlers'
import { registerSettingsHandlers } from './adapters/electron/settings-handlers'
import { registerChatHandlers } from './adapters/electron/chat-handlers'
export function registerIpc(): void {
  register('actions:list', listActions)
  register('actions:create', createAction)
  register('actions:edit', editAction)
  register('actions:classify', classifyActions)
  registerLibraryHandlers(getSettings)
  registerArticleHandlers()
  registerSessionHandlers()
  registerReadingHandlers()
  registerWorkbenchHandlers()
  registerSettingsHandlers()
  registerSpeechHandlers()
  registerChatHandlers()
}
