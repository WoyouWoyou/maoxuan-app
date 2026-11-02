import React from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { createAppClient } from './application/client'
import { createBrowserStore } from './adapters/indexeddb'
import type { Article } from './domain/models'
import { App } from './ui/App'
import { createDesktopApi } from './application/desktop-api'
import { createSecrets } from './adapters/secrets'
import { chooseMarkdown, exportMarkdown } from './adapters/documents'
import '@renderer/styles.css'
import './ui/styles.css'
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* Offline caching may be unavailable in private browsers. */
  })
}
async function boot() {
  const response = await fetch('./articles.json')
  if (!response.ok) throw new Error('内置书库资源缺失')
  const articles: Article[] = await response.json()
  const store = Capacitor.isNativePlatform()
    ? await (await import('./adapters/sqlite')).createNativeStore()
    : await createBrowserStore()
  const desktop = await createDesktopApi(store, articles, await createSecrets(), {
    choose: chooseMarkdown,
    export: exportMarkdown
  })
  window.api = desktop.api
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App
        client={createAppClient(store, articles)}
        native={Capacitor.isNativePlatform()}
        refresh={desktop.refresh}
      />
    </React.StrictMode>
  )
}
boot().catch((error) => {
  const root = document.getElementById('root')!
  root.textContent = `无法打开本地数据库：${error instanceof Error ? error.message : error}。请保留应用数据后重试。`
})
