import type { ActionQuadrant, WbAction, WbHorizon, WbLedgerEntry, WorkbenchData } from '../types'
import { changed } from './reading'
/**
 * 工作清单里手工新增并关联工作台的输入。只包含用户能填的字段：
 * 由主进程补齐 planningState='queued'、status='todo'、progress=[]、createdAt，并拒绝覆盖已有 ID。
 */
export interface WbQueuedActionInput {
  id: string
  horizon: WbHorizon
  action: string
  purpose: string
  verify: string
  standards: string[]
  kpi: string
  quadrant?: ActionQuadrant | null
  dueDate?: string
}
export type WorkbenchCommand =
  | { kind: 'form'; value: WorkbenchData['form'] }
  | { kind: 'intake'; value: WorkbenchData['intake'] }
  | {
      kind: 'diagnosisModule'
      module: keyof WorkbenchData['diagnosis']
      value: WorkbenchData['diagnosis'][keyof WorkbenchData['diagnosis']]
    }
  | { kind: 'decision'; value: WorkbenchData['decision'] }
  | { kind: 'checks'; value: WorkbenchData['actionChecks'] }
  | { kind: 'action'; value: WbAction }
  | { kind: 'removeAction'; id: string }
  | { kind: 'enqueueActions'; ids: string[] }
  | { kind: 'returnActionsToCandidates'; ids: string[] }
  | { kind: 'createQueuedAction'; value: WbQueuedActionInput }
  | { kind: 'appendLedger'; value: WbLedgerEntry }
export function workbenchCommands(before: WorkbenchData, after: WorkbenchData): WorkbenchCommand[] {
  const out: WorkbenchCommand[] = []
  for (const kind of ['form', 'intake', 'decision'] as const)
    if (changed(before[kind], after[kind]))
      out.push({ kind, value: after[kind] } as WorkbenchCommand)
  for (const module of ['contradiction', 'routes', 'objSubj'] as const)
    if (changed(before.diagnosis[module], after.diagnosis[module]))
      out.push({ kind: 'diagnosisModule', module, value: after.diagnosis[module] })
  if (changed(before.actionChecks, after.actionChecks))
    out.push({ kind: 'checks', value: after.actionChecks })
  for (const a of after.actions) {
    const prev = before.actions.find((x) => x.id === a.id)
    if (!changed(prev, a)) continue
    // 纳入状态必须走显式命令，不能被普通 action 更新悄悄折叠。
    if (prev && prev.planningState !== a.planningState)
      throw new Error('纳入状态只能通过加入待办或移回候选修改')
    out.push({ kind: 'action', value: a })
  }
  for (const a of before.actions)
    if (!after.actions.some((x) => x.id === a.id)) out.push({ kind: 'removeAction', id: a.id })
  if (
    before.ledger.some((x) =>
      changed(
        x,
        after.ledger.find((y) => y.id === x.id)
      )
    )
  )
    throw new Error('项目台账只能追加')
  for (const e of after.ledger)
    if (!before.ledger.some((x) => x.id === e.id)) out.push({ kind: 'appendLedger', value: e })
  return out
}
