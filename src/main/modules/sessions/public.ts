import { createSessionService, type SessionDependencies, type SessionService } from './service'
import type { SessionRepository } from './ports'
export { createSessionService } from './service'
export type { SessionDependencies, SessionService } from './service'
export type { SessionRepository } from './ports'
export { decodeSessionData } from './data'
export { fingerprint, createSuggestionContext, assertSuggestionContext } from './suggestions'
// The desktop facade binds one app lifetime instance. Tests and other hosts can create isolated services.
let current: SessionService | undefined
function service(): SessionService {
  if (!current) throw new Error('会话模块尚未初始化')
  return current
}
export function configureSessions(repo: SessionRepository, deps: SessionDependencies): void {
  current = createSessionService(repo, deps)
}
export const getSession: SessionService['getSession'] = (...args) => service().getSession(...args)
export const requireSession: SessionService['requireSession'] = (...args) =>
  service().requireSession(...args)
export const listSessions: SessionService['listSessions'] = (...args) =>
  service().listSessions(...args)
export const listArchivedSessions: SessionService['listArchivedSessions'] = (...args) =>
  service().listArchivedSessions(...args)
export const listTrashSessions: SessionService['listTrashSessions'] = (...args) =>
  service().listTrashSessions(...args)
export const createSession: SessionService['createSession'] = (...args) =>
  service().createSession(...args)
export const mutateSession: SessionService['mutateSession'] = (...args) =>
  service().mutateSession(...args)
export const updateSession: SessionService['updateSession'] = (...args) =>
  service().updateSession(...args)
export const archiveSession: SessionService['archiveSession'] = (...args) =>
  service().archiveSession(...args)
export const unarchiveSession: SessionService['unarchiveSession'] = (...args) =>
  service().unarchiveSession(...args)
export const trashSession: SessionService['trashSession'] = (...args) =>
  service().trashSession(...args)
export const restoreSession: SessionService['restoreSession'] = (...args) =>
  service().restoreSession(...args)
export const removeSession: SessionService['removeSession'] = (...args) =>
  service().removeSession(...args)
export const emptyTrash: SessionService['emptyTrash'] = (...args) => service().emptyTrash(...args)
export const purgeExpiredTrash: SessionService['purgeExpiredTrash'] = (...args) =>
  service().purgeExpiredTrash(...args)
export const listVersions: SessionService['listVersions'] = (...args) =>
  service().listVersions(...args)
export const getVersion: SessionService['getVersion'] = (...args) => service().getVersion(...args)
export const restoreVersion: SessionService['restoreVersion'] = (...args) =>
  service().restoreVersion(...args)
export const listMessages: SessionService['listMessages'] = (...args) =>
  service().listMessages(...args)
export const addMessage: SessionService['addMessage'] = (...args) => service().addMessage(...args)
export const clearMessages: SessionService['clearMessages'] = (...args) =>
  service().clearMessages(...args)
