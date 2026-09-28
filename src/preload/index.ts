import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MaoxuanApi } from '@shared/api'
import type { ChatChunkEvent, ChatDoneEvent, ChatErrorEvent } from '@shared/types'

function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: MaoxuanApi = {
  articles: {
    list: () => ipcRenderer.invoke('articles:list'),
    get: (id) => ipcRenderer.invoke('articles:get', id),
    search: (query, limit) => ipcRenderer.invoke('articles:search', query, limit)
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    listArchived: () => ipcRenderer.invoke('sessions:listArchived'),
    listTrash: () => ipcRenderer.invoke('sessions:listTrash'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (problemText) => ipcRenderer.invoke('sessions:create', problemText),
    update: (id, patch, versionLabel) => ipcRenderer.invoke('sessions:update', id, patch, versionLabel),
    remove: (id) => ipcRenderer.invoke('sessions:remove', id),
    archive: (id) => ipcRenderer.invoke('sessions:archive', id),
    unarchive: (id) => ipcRenderer.invoke('sessions:unarchive', id),
    trash: (id) => ipcRenderer.invoke('sessions:trash', id),
    restore: (id) => ipcRenderer.invoke('sessions:restore', id),
    emptyTrash: () => ipcRenderer.invoke('sessions:emptyTrash')
  },
  versions: {
    list: (sessionId) => ipcRenderer.invoke('versions:list', sessionId),
    get: (versionId) => ipcRenderer.invoke('versions:get', versionId),
    restore: (versionId) => ipcRenderer.invoke('versions:restore', versionId)
  },
  chat: {
    list: (sessionId) => ipcRenderer.invoke('chat:list', sessionId),
    send: (sessionId, content, articleId) => ipcRenderer.invoke('chat:send', sessionId, content, articleId),
    clear: (sessionId) => ipcRenderer.invoke('chat:clear', sessionId),
    onChunk: (cb) => subscribe<ChatChunkEvent>('chat:chunk', cb),
    onDone: (cb) => subscribe<ChatDoneEvent>('chat:done', cb),
    onError: (cb) => subscribe<ChatErrorEvent>('chat:error', cb)
  },
  ai: {
    diagnose: (sessionId) => ipcRenderer.invoke('ai:diagnose', sessionId),
    reviseProblem: (sessionId) => ipcRenderer.invoke('ai:reviseProblem', sessionId),
    findPassages: (sessionId, articleId) => ipcRenderer.invoke('ai:findPassages', sessionId, articleId),
    reviewNotes: (sessionId, articleId, notes) =>
      ipcRenderer.invoke('ai:reviewNotes', sessionId, articleId, notes),
    reviewSituation: (sessionId, newSituation) =>
      ipcRenderer.invoke('ai:reviewSituation', sessionId, newSituation),
    mindset: (sessionId) => ipcRenderer.invoke('ai:mindset', sessionId)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
    test: () => ipcRenderer.invoke('settings:test')
  }
}

contextBridge.exposeInMainWorld('api', api)
