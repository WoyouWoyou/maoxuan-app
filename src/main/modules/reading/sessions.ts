import type { Session, SessionPatch, StepKey } from '@shared/types'
import { applyReadingCommands, type ReadingCommand } from '@shared/contracts/reading'
interface SessionRepository {
  get(id: string): Session | null
  update(id: string, patch: SessionPatch, label?: string): Session
}
let repository: SessionRepository
export function configureReadingSessions(value: SessionRepository) {
  repository = value
}
export function applyCommands(
  id: string,
  commands: ReadingCommand[],
  expectedStateVersion: number,
  label?: string,
  step?: StepKey
): Session {
  const session = repository.get(id)
  if (!session || session.mode !== 'reading') throw new Error('阅读会话不存在')
  if (!Number.isInteger(expectedStateVersion)) throw new Error('缺少会话版本，请重新打开问题')
  if (session.stateVersion !== expectedStateVersion)
    throw new Error('内容已更新，请重新打开问题后重试')
  if (step && !['problem', 'focus', 'relate', 'apply'].includes(step))
    throw new Error('阅读步骤无效')
  return repository.update(
    id,
    { expectedStateVersion, data: applyReadingCommands(session.data, commands), currentStep: step },
    label
  )
}
