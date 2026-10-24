import type { Session, SessionMode, SessionPatch } from '@shared/types'
import {
  listSessions,
  listArchivedSessions,
  listTrashSessions,
  getSession,
  createSession,
  updateSession,
  removeSession,
  archiveSession,
  unarchiveSession,
  trashSession,
  restoreSession,
  emptyTrash,
  listVersions,
  getVersion,
  restoreVersion
} from '../../modules/sessions/public'
import { register, toError } from './transport'
export function registerSessionHandlers(): void {
  register<[], ReturnType<typeof listSessions>>('sessions:list', () => listSessions())
  register<[], ReturnType<typeof listArchivedSessions>>('sessions:listArchived', () =>
    listArchivedSessions()
  )
  register<[], ReturnType<typeof listTrashSessions>>('sessions:listTrash', () =>
    listTrashSessions()
  )
  register<[string], Session | null>('sessions:get', (id) => getSession(id))
  register<[string, SessionMode | undefined, string | undefined], Session>(
    'sessions:create',
    (problemText, mode, bookId) =>
      createSession(problemText, mode === 'workbench' ? 'workbench' : 'reading', bookId)
  )
  register<[string, SessionPatch, string | undefined], Session>(
    'sessions:update',
    (id, patch, versionLabel) => updateSession(id, patch, versionLabel)
  )
  register<[string], void>('sessions:remove', (id) => {
    removeSession(id)
  })
  register<[string], void>('sessions:archive', (id) => {
    archiveSession(id)
  })
  register<[string], void>('sessions:unarchive', (id) => {
    unarchiveSession(id)
  })
  register<[string], void>('sessions:trash', (id) => {
    trashSession(id)
  })
  register<[string], void>('sessions:restore', (id) => {
    restoreSession(id)
  })
  register<[], number>('sessions:emptyTrash', () => emptyTrash())

  register<[string], ReturnType<typeof listVersions>>('versions:list', (sessionId) =>
    listVersions(sessionId)
  )
  register<[string], ReturnType<typeof getVersion>>('versions:get', (versionId) =>
    getVersion(versionId)
  )
  register('versions:restore', restoreVersion)
}
