import { createIndexRepository } from './adapters/sqlite/index-repository'
import { configureReadingSessions } from './modules/reading/sessions'
import { getSession, updateSession } from './adapters/sqlite/session-repository'
import { chatCompletionsTransport } from './adapters/model/chat-completions'
import { configureImporting } from './modules/importing/public'
import { createImportFilesAdapter } from './adapters/electron/import-files'
import type Database from 'better-sqlite3'
import { createTaskRepository } from './adapters/sqlite/task-repository'
import { createLibraryRepository } from './adapters/sqlite/library-repository'
import { createUsageRepository } from './adapters/sqlite/usage-repository'
import { configureModels } from './modules/model-config/public'
import { createModelConfigRepository } from './adapters/sqlite/model-config-repository'
import { safeStorage } from 'electron'
import { BrowserWindow } from 'electron'
import { configureLibrary } from './modules/library/public'
import { configureTasks } from './modules/tasks/public'
import { configureUsage, beginCall, finishCall } from './modules/usage/public'
import { configureModelRuntime } from './modules/model-runtime/public'
import { configureRetrieval } from './modules/retrieval/public'
export function bootstrap(handle: Database.Database): void {
  configureImporting(createImportFilesAdapter())
  configureModels(
    createModelConfigRepository(handle, {
      encrypt: (value) => {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥存储不可用')
        return safeStorage.encryptString(value).toString('base64')
      },
      decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
    })
  )
  configureReadingSessions({ get: getSession, update: updateSession })
  configureLibrary(createLibraryRepository(handle))
  configureTasks(createTaskRepository(handle), (task) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('tasks:changed', task)
  })
  configureUsage(createUsageRepository(handle))
  configureModelRuntime({ begin: beginCall, finish: finishCall }, chatCompletionsTransport)
  configureRetrieval(createIndexRepository(handle))
}
