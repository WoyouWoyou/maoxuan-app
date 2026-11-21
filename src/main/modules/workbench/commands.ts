import type { StepKey } from '@shared/types'
import type { WorkbenchCommand } from '@shared/contracts/workbench'
import { applyWorkbenchCommands } from '@shared/engine/workbench-reducer'
export { applyWorkbenchCommands } from '@shared/engine/workbench-reducer'
import { mutateSession } from '../sessions/public'
export function applyWorkbench(
  id: string,
  commands: WorkbenchCommand[],
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
    (s) => {
      if (s.mode !== 'workbench' || !s.data.workbench) throw new Error('这个会话不是工作台模式')
      return {
        data: { ...s.data, workbench: applyWorkbenchCommands(s.data.workbench, commands) },
        currentStep: step ?? s.currentStep
      }
    },
    label
  )
}
