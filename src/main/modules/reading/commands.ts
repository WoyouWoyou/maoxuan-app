import type { SessionData, StepKey } from '@shared/types'
import type { ReadingCommand } from '@shared/contracts/reading'
import { applyReadingCommands } from '@shared/engine/reading-reducer'
export { applyReadingCommands } from '@shared/engine/reading-reducer'
import { mutateSession } from '../sessions/public'
export function applyCommands(
  id: string,
  commands: ReadingCommand[],
  expected: number,
  label?: string,
  step?: StepKey,
  mutationId?: string
) {
  return mutateSession(
    id,
    expected,
    mutationId!,
    { commands, step },
    (session) => {
      if (session.mode !== 'reading') throw new Error('阅读会话不存在')
      return {
        data: applyReadingCommands(session.data, commands),
        currentStep: step ?? session.currentStep
      }
    },
    label
  )
}
