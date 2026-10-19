import {
  listModels,
  saveModel,
  selectModel,
  modelRoutes,
  setModelRoute
} from '../../modules/model-config/public'
import { applyCommands } from '../../modules/reading/sessions'
import { ipcMain } from 'electron'
import { listBooks, hideBook, requireBook } from '../../modules/library/public'
import { listTasks, getTask, cancelTask } from '../../modules/tasks/public'
import { queryUsage } from '../../modules/usage/public'
import { startIndex } from '../../modules/retrieval/public'
import { cancelModelCalls } from '../../modules/model-runtime/public'
import { chooseBook, confirmBook } from '../../modules/importing/public'
import type { Settings } from '@shared/types'
export function registerLibraryHandlers(settings: (purpose?: string) => Settings): void {
  ipcMain.handle('reading:apply', (_e, id, commands, version, label, step) =>
    applyCommands(id, commands, version, label, step)
  )
  ipcMain.handle('library:list', (_e, hidden) => listBooks(hidden === true))
  ipcMain.handle('library:hide', (_e, id, hidden) => hideBook(String(id), hidden === true))
  ipcMain.handle('library:choose', (_e, encoding) => chooseBook(encoding))
  ipcMain.handle('library:confirm', (_e, id, title, author, edits) =>
    confirmBook(String(id), String(title), String(author), edits)
  )
  ipcMain.handle('library:index', (_e, id) => {
    const b = requireBook(String(id))
    return startIndex(b, settings('index'))
  })
  ipcMain.handle('tasks:list', () => listTasks())
  ipcMain.handle('tasks:get', (_e, id) => getTask(String(id)))
  ipcMain.handle('tasks:cancel', (_e, id) => cancelTask(String(id)))
  ipcMain.handle('models:routes', () => modelRoutes())
  ipcMain.handle('models:setRoute', (_e, purpose, id) => setModelRoute(String(purpose), String(id)))
  ipcMain.handle('models:list', () => listModels())
  ipcMain.handle('models:save', (_e, id, name, value) => saveModel(id, String(name), value))
  ipcMain.handle('models:select', (_e, id) => selectModel(String(id)))
  ipcMain.handle('models:cancel', (_e, id) => cancelModelCalls(String(id)))
  ipcMain.handle('usage:query', (_e, q) => queryUsage(q))
}
