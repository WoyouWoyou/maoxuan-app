import { certificateStore } from './adapters/electron/sync-certificate'
import { createLanSync } from './adapters/network/lan-sync'
import { createSyncRepository } from './adapters/sqlite/sync-repository'
import { ipcMain } from 'electron'
import { app } from 'electron'
import { join } from 'node:path'
import { configureJournal } from './modules/journal/public'
import { createJournalRepository } from './adapters/sqlite/journal-repository'
import { createJournalAssets } from './adapters/electron/journal-assets'
import { configureMarch } from './modules/long-march/public'
import { createMarchRepository } from './adapters/sqlite/long-march-repository'
import { configureActions } from './modules/action-planning/public'
import { createMarchObservedRepositories } from './adapters/sqlite/march-observer'
import { createProxyController } from './adapters/network/proxy'
import { session } from 'electron'
import { createIndexRepository } from './adapters/sqlite/index-repository'
import { configureSessions } from './modules/sessions/public'
import { validateReadingSession } from './modules/reading/public'
import { validateWorkbenchSession } from './modules/workbench/public'
import { configureSettings, configureProxy } from './modules/settings/public'
import { createSettingsRepository } from './adapters/sqlite/settings-repository'
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
  const lanSync = createLanSync(
    createSyncRepository(handle),
    undefined,
    certificateStore(join(app.getPath('userData'), 'device-sync-certificate.enc'))
  )
  for (const [channel, job] of [
    ['sync:status', () => lanSync.status()],
    ['sync:start', () => lanSync.start()],
    ['sync:stop', () => lanSync.stop()]
  ] as const) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      if (args.length) throw Error('同步设置不接受参数')
      return job()
    })
  }
  app.once('before-quit', () => void lanSync.stop())
  const march = configureMarch(createMarchRepository(handle))
  const { sessions, actions } = createMarchObservedRepositories(handle, march)
  configureJournal(
    createJournalRepository(handle),
    createJournalAssets(join(app.getPath('userData'), 'journal', 'assets')),
    (id, createdAt) =>
      march.observe([{ id: `journal:${id}:completed`, kind: 'journal', createdAt }])
  )
  configureActions(actions)
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
  configureSessions(sessions, {
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
