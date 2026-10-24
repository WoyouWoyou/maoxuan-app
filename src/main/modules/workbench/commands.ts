import { wbRawInputText } from '@shared/workbench'
import { workbenchCommandSchema } from '@shared/contracts/ipc'
import { array } from '@shared/contracts/validation'
import type { WorkbenchData, StepKey } from '@shared/types'
import type { WorkbenchCommand } from '@shared/contracts/workbench'
import { assertWorkbench } from '@shared/contracts/state-schema'
import { mutateSession } from '../sessions/public'
import {
  createQueuedAction,
  enqueueCandidates,
  guardActionCommand,
  returnActionsToCandidates
} from './action-planning'
export function applyWorkbenchCommands(
  data: WorkbenchData,
  commands: WorkbenchCommand[]
): WorkbenchData {
  if (!Array.isArray(commands) || commands.length > 500) throw new Error('无效的工作台命令')
  array(workbenchCommandSchema, 500)(commands, 'commands')
  let next = structuredClone(data)
  for (const c of commands) {
    if (!c || typeof c !== 'object') throw new Error('无效的工作台命令')
    switch (c.kind) {
      case 'form':
        next.form = c.value
        break
      case 'intake': {
        const requestId = c.value?._context?.requestId
        const generated =
          requestId &&
          c.value?._context?.purpose === 'wb_intake' &&
          requestId !== next.intake?._context?.requestId
        next.intake = c.value
        if (generated && c.value) {
          const first = next.ledger.length === 0
          next.ledger.push({
            id: `intake:${requestId}`,
            createdAt: c.value.generatedAt,
            inputType: first ? 'new' : 'update',
            rawInput: wbRawInputText(next),
            factDelta: [],
            judgmentDelta: [],
            actionsDelta: [],
            oldAssumptionsToFix: [],
            summary: `事实台账 ${c.value.facts.length} 条，缺失 ${c.value.missing.length} 项`,
            _context: c.value._context
          })
        }
        break
      }
      case 'decision':
        next.decision = c.value
        break
      case 'checks':
        next.actionChecks = c.value
        break
      case 'diagnosisModule':
        if (!['contradiction', 'routes', 'objSubj'].includes(c.module))
          throw new Error('未知的诊断模块')
        Object.assign(next.diagnosis, { [c.module]: c.value })
        break
      case 'action': {
        const current = next.actions.find((x) => x.id === c.value.id)
        guardActionCommand(current, c.value)
        next.actions = current
          ? next.actions.map((x) => (x.id === c.value.id ? c.value : x))
          : [...next.actions, c.value]
        break
      }
      case 'enqueueActions':
        next = enqueueCandidates(next, c.ids)
        break
      case 'returnActionsToCandidates':
        next = returnActionsToCandidates(next, c.ids)
        break
      case 'createQueuedAction':
        next = createQueuedAction(next, c.value, new Date().toISOString())
        break
      case 'removeAction':
        next.actions = next.actions.filter((x) => x.id !== c.id)
        break
      case 'appendLedger':
        if (next.ledger.some((x) => x.id === c.value.id)) throw new Error('台账记录已存在')
        next.ledger.push(c.value)
        break
      default:
        throw new Error('未知的工作台命令')
    }
  }
  assertWorkbench(next)
  return next
}
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
