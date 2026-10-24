import {
  listModels,
  saveModel,
  selectModel,
  modelRoutes,
  setModelRoute
} from '../../modules/model-config/public'
import { register } from './transport'
import { listBooks, hideBook, requireBook } from '../../modules/library/public'
import { listTasks, getTask, cancelTask } from '../../modules/tasks/public'
import { queryUsage } from '../../modules/usage/public'
import { startIndex } from '../../modules/retrieval/public'
import { cancelModelCalls } from '../../modules/model-runtime/public'
import { chooseBook, confirmBook } from '../../modules/importing/public'
import type { Settings } from '@shared/types'
export function registerLibraryHandlers(settings: (purpose?: string) => Settings): void {
  register('library:list', (hidden?: boolean) => listBooks(hidden === true))
  register('library:hide', (id: string, hidden: boolean) => hideBook(String(id), hidden === true))
  register('library:choose', (encoding?: string) => chooseBook(encoding))
  register(
    'library:confirm',
    (
      id: string,
      title: string,
      author: string,
      edits?: import('@shared/contracts/library').ImportEdits
    ) => confirmBook(String(id), String(title), String(author), edits)
  )
  register('library:index', (id: string) => {
    const b = requireBook(String(id))
    return startIndex(b, settings('index'))
  })
  register('tasks:list', () => listTasks())
  register('tasks:get', (id: string) => getTask(String(id)))
  register('tasks:cancel', (id: string) => cancelTask(String(id)))
  register('models:routes', () => modelRoutes())
  register('models:setRoute', (purpose: string, id: string) =>
    setModelRoute(String(purpose), String(id))
  )
  register('models:list', () => listModels())
  register('models:save', (id: string | undefined, name: string, value: Settings) =>
    saveModel(id, String(name), value)
  )
  register('models:select', (id: string) => selectModel(String(id)))
  register('models:cancel', (id: string) => cancelModelCalls(String(id)))
  register('usage:query', (q?: import('@shared/contracts/usage').UsageQuery) => queryUsage(q))
}
