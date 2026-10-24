import { configureActions } from './modules/action-planning/public'
import { createActionRepository } from './adapters/sqlite/action-repository'
import { createProxyController } from './adapters/network/proxy'
import { session } from 'electron'
import { createIndexRepository } from './adapters/sqlite/index-repository'
import { configureSessions } from './modules/sessions/public'
import { validateReadingSession } from './modules/reading/public'
import { validateWorkbenchSession } from './modules/workbench/public'
import { configureSettings, configureProxy } from './modules/settings/public'
import { createSettingsRepository } from './adapters/sqlite/settings-repository'
import { createSessionRepository } from './adapters/sqlite/session-repository'
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
import { configureLibrary, requireBook } from './modules/library/public'
import { configureTasks } from './modules/tasks/public'
import { configureUsage, beginCall, finishCall } from './modules/usage/public'
import { configureModelRuntime } from './modules/model-runtime/public'
import { configureRetrieval } from './modules/retrieval/public'
export async function bootstrap(handle: Database.Database): Promise<void> {
  configureActions(createActionRepository(handle))
  configureImporting(createImportFilesAdapter())
  const secrets = {
    encrypt: (value: string) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥存储不可用')
      return safeStorage.encryptString(value).toString('base64')
    },
    decrypt: (value: string) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  configureLibrary(createLibraryRepository(handle))
  configureModels(createModelConfigRepository(handle, secrets))
  configureSettings(createSettingsRepository(handle, secrets), {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_MODEL
  })
  await configureProxy(createProxyController(() => [session.defaultSession]))
  configureSessions(createSessionRepository(handle), {
    requireBook,
    validate: (session, next, restoring, step) =>
      session.mode === 'reading'
        ? validateReadingSession(session, next, restoring, step)
        : validateWorkbenchSession(session, next, restoring, step)
  })
  configureTasks(createTaskRepository(handle), (task) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('tasks:changed', task)
  })
  configureUsage(createUsageRepository(handle))
  configureModelRuntime({ begin: beginCall, finish: finishCall }, chatCompletionsTransport)
  configureRetrieval(createIndexRepository(handle))
}
