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
  actions: {
    list: () => ipcRenderer.invoke('actions:list'),
    create: (edit) => ipcRenderer.invoke('actions:create', edit),
    edit: (id, edit, progress) => ipcRenderer.invoke('actions:edit', id, edit, progress),
    classify: (refs, today) => ipcRenderer.invoke('actions:classify', refs, today)
  },
  speech: {
    synthesize: (request) => ipcRenderer.invoke('speech:synthesize', request),
    prefetch: (request) => ipcRenderer.invoke('speech:prefetch', request),
    cancel: (id) => ipcRenderer.invoke('speech:cancel', id)
  },
  reading: {
    apply: (id, commands, version, label, step, mutationId = crypto.randomUUID()) =>
      ipcRenderer.invoke('reading:apply', id, commands, version, label, step, mutationId)
  },
  library: {
    list: (hidden) => ipcRenderer.invoke('library:list', hidden),
    hide: (id, hidden) => ipcRenderer.invoke('library:hide', id, hidden),
    choose: (encoding) => ipcRenderer.invoke('library:choose', encoding),
    confirm: (id, title, author, edits) =>
      ipcRenderer.invoke('library:confirm', id, title, author, edits),
    index: (id) => ipcRenderer.invoke('library:index', id)
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id) => ipcRenderer.invoke('tasks:get', id),
    cancel: (id) => ipcRenderer.invoke('tasks:cancel', id),
    onChanged: (cb) => subscribe('tasks:changed', cb)
  },
  usage: { query: (q) => ipcRenderer.invoke('usage:query', q) },
  models: {
    routes: () => ipcRenderer.invoke('models:routes'),
    setRoute: (purpose, id) => ipcRenderer.invoke('models:setRoute', purpose, id),
    cancel: (id) => ipcRenderer.invoke('models:cancel', id),
    list: () => ipcRenderer.invoke('models:list'),
    save: (id, name, settings) => ipcRenderer.invoke('models:save', id, name, settings),
    select: (id) => ipcRenderer.invoke('models:select', id)
  },
  articles: {
    list: (scope) => ipcRenderer.invoke('articles:list', scope),
    get: (id, scope) => ipcRenderer.invoke('articles:get', id, scope),
    search: (query, limit, scope) => ipcRenderer.invoke('articles:search', query, limit, scope)
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    listArchived: () => ipcRenderer.invoke('sessions:listArchived'),
    listTrash: () => ipcRenderer.invoke('sessions:listTrash'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (problemText, mode, bookId) =>
      ipcRenderer.invoke('sessions:create', problemText, mode, bookId),
    update: (id, patch, versionLabel) =>
      ipcRenderer.invoke(
        'sessions:update',
        id,
        { ...patch, mutationId: patch.mutationId ?? crypto.randomUUID() },
        versionLabel
      ),
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
    restore: (versionId, version, mutationId = crypto.randomUUID()) =>
      ipcRenderer.invoke('versions:restore', versionId, version, mutationId)
  },
  chat: {
    list: (sessionId) => ipcRenderer.invoke('chat:list', sessionId),
    send: (sessionId, content, articleId) =>
      ipcRenderer.invoke('chat:send', sessionId, content, articleId),
    clear: (sessionId) => ipcRenderer.invoke('chat:clear', sessionId),
    onChunk: (cb) => subscribe<ChatChunkEvent>('chat:chunk', cb),
    onDone: (cb) => subscribe<ChatDoneEvent>('chat:done', cb),
    onError: (cb) => subscribe<ChatErrorEvent>('chat:error', cb)
  },
  ai: {
    diagnose: (sessionId) => ipcRenderer.invoke('ai:diagnose', sessionId),
    reviseProblem: (sessionId) => ipcRenderer.invoke('ai:reviseProblem', sessionId),
    findPassages: (sessionId, articleId) =>
      ipcRenderer.invoke('ai:findPassages', sessionId, articleId),
    reviewNotes: (sessionId, articleId, notes) =>
      ipcRenderer.invoke('ai:reviewNotes', sessionId, articleId, notes),
    reviewSituation: (sessionId, newSituation) =>
      ipcRenderer.invoke('ai:reviewSituation', sessionId, newSituation),
    mindset: (sessionId) => ipcRenderer.invoke('ai:mindset', sessionId)
  },
  wb: {
    apply: (id, commands, version, label, step, mutationId = crypto.randomUUID()) =>
      ipcRenderer.invoke('wb:apply', id, commands, version, label, step, mutationId),
    intake: (sessionId) => ipcRenderer.invoke('wb:intake', sessionId),
    contradiction: (sessionId) => ipcRenderer.invoke('wb:contradiction', sessionId),
    routes: (sessionId) => ipcRenderer.invoke('wb:routes', sessionId),
    objSubj: (sessionId) => ipcRenderer.invoke('wb:objSubj', sessionId),
    decide: (sessionId) => ipcRenderer.invoke('wb:decide', sessionId),
    recheck: (sessionId) => ipcRenderer.invoke('wb:recheck', sessionId),
    actions: (sessionId) => ipcRenderer.invoke('wb:actions', sessionId),
    recap: (sessionId, input) => ipcRenderer.invoke('wb:recap', sessionId, input)
  },
  settings: {
    getReader: () => ipcRenderer.invoke('settings:getReader'),
    setReader: (preferences) => ipcRenderer.invoke('settings:setReader', preferences),
    getProxy: () => ipcRenderer.invoke('settings:getProxy'),
    setProxy: (settings) => ipcRenderer.invoke('settings:setProxy', settings),
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
    test: () => ipcRenderer.invoke('settings:test')
  }
}

contextBridge.exposeInMainWorld('api', api)
