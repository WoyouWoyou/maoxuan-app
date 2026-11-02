import { createHash, randomUUID } from 'node:crypto'
import { createSessionService as createPortableService } from '@shared/engine/session'
import type { SessionDependencies } from '@shared/engine/session'
import type { SessionRepository } from './ports'
export type { SessionDependencies } from '@shared/engine/session'
export function createSessionService(repo: SessionRepository, deps: SessionDependencies) {
  return createPortableService(repo, deps, {
    randomUUID,
    hash: (text) => createHash('sha256').update(text).digest('hex')
  })
}
export type SessionService = ReturnType<typeof createSessionService>
