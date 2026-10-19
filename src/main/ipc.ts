import { registerLibraryHandlers } from './adapters/electron/library-handlers'
import { getSettings } from './adapters/sqlite/session-repository'
import { registerArticleHandlers } from './adapters/electron/article-handlers'
import { registerSessionHandlers } from './adapters/electron/session-handlers'
import { registerReadingHandlers } from './adapters/electron/reading-handlers'
import { registerWorkbenchHandlers } from './adapters/electron/workbench-handlers'
import { registerSettingsHandlers } from './adapters/electron/settings-handlers'
import { registerChatHandlers } from './adapters/electron/chat-handlers'
export function registerIpc(): void {
  registerLibraryHandlers(getSettings)
  registerArticleHandlers()
  registerSessionHandlers()
  registerReadingHandlers()
  registerWorkbenchHandlers()
  registerSettingsHandlers()
  registerChatHandlers()
}
