import path from 'path'
import fs from 'node:fs'
import { bootstrap } from './bootstrap'
import { app, BrowserWindow, shell, dialog } from 'electron'
import { config as loadEnv } from 'dotenv'
import { TRASH_RETENTION_DAYS } from '@shared/core'
import { openDatabase } from './adapters/sqlite/database'
import { purgeExpiredTrash } from './modules/sessions/public'
import { loadArticles } from './adapters/electron/builtin-library'
import { registerIpc } from './ipc'

if (!app.isPackaged && process.env.MAOXUAN_USER_DATA) {
  fs.mkdirSync(process.env.MAOXUAN_USER_DATA, { recursive: true })
  app.setPath('userData', process.env.MAOXUAN_USER_DATA)
}

if (!app.isPackaged && !process.env.MAOXUAN_TEST) {
  loadEnv({ path: path.join(app.getAppPath(), '.env') })
}

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000

function purgeTrash(): void {
  try {
    purgeExpiredTrash(TRASH_RETENTION_DAYS)
  } catch (error) {
    console.error('清理回收站失败', error)
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f6f1e7',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app
  .whenReady()
  .then(async () => {
    await bootstrap(openDatabase(path.join(app.getPath('userData'), 'maoxuan.db')))
    purgeTrash()
    setInterval(purgeTrash, PURGE_INTERVAL_MS)
    loadArticles()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    dialog.showErrorBox('应用启动失败', error instanceof Error ? error.message : String(error))
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
