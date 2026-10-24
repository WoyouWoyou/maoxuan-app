import type { WbAction, WorkbenchData } from '@shared/types'
import type { WbQueuedActionInput } from '@shared/contracts/workbench'

/** 与批量任务操作保持同一规模上限。 */
export const ACTION_BATCH_LIMIT = 200

function uniqueIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('请先选择要整理的策略')
  if (ids.length > ACTION_BATCH_LIMIT) throw new Error(`一次最多处理 ${ACTION_BATCH_LIMIT} 条行动`)
  const out: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('行动标识无效')
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/** 整批定位：缺失的 ID 让整批失败，不静默少改。 */
function locate(wb: WorkbenchData, ids: string[]): WbAction[] {
  const byId = new Map(wb.actions.map((a) => [a.id, a]))
  return uniqueIds(ids).map((id) => {
    const action = byId.get(id)
    if (!action) throw new Error('有行动已被删除，请刷新后重新选择')
    return action
  })
}

function replace(wb: WorkbenchData, plan: Set<string>, change: (a: WbAction) => WbAction) {
  if (plan.size === 0) return wb
  return {
    ...wb,
    actions: wb.actions.map((a) => (plan.has(a.id) ? change(a) : a))
  }
}

/** 加入待办：只把候选改成已纳入，保留全部规划字段；已经纳入的视为无变化。 */
export function enqueueCandidates(wb: WorkbenchData, ids: string[]): WorkbenchData {
  const plan = new Set<string>()
  for (const action of locate(wb, ids)) {
    if (action.planningState === 'queued') continue
    if (action.status !== 'todo')
      throw new Error(`「${action.action.slice(0, 16)}」已经开始执行过，不能作为候选加入`)
    plan.add(action.id)
  }
  return replace(wb, plan, (a) => ({ ...a, planningState: 'queued' }))
}

/** 移回候选：只允许未完成、未放弃且没有阶段记录的行动，防止隐藏正在执行的记录。 */
export function returnActionsToCandidates(wb: WorkbenchData, ids: string[]): WorkbenchData {
  const plan = new Set<string>()
  for (const action of locate(wb, ids)) {
    if (action.planningState === 'candidate') continue
    if (action.status !== 'todo')
      throw new Error(
        `「${action.action.slice(0, 16)}」${action.status === 'done' ? '已完成' : '已放弃'}，不能移回候选`
      )
    if ((action.progress?.length ?? 0) > 0)
      throw new Error(`「${action.action.slice(0, 16)}」已有阶段记录，不能移回候选`)
    plan.add(action.id)
  }
  return replace(wb, plan, (a) => ({ ...a, planningState: 'candidate' }))
}

/** 工作清单里手工新增并关联工作台：创建动作本身就是明确的执行意图，直接 queued + todo。 */
export function createQueuedAction(
  wb: WorkbenchData,
  input: WbQueuedActionInput,
  now: string
): WorkbenchData {
  if (wb.actions.some((a) => a.id === input.id)) throw new Error('行动标识已存在，请刷新后重试')
  const action = (input.action ?? '').trim()
  if (!action) throw new Error('请填写要做的动作')
  const standards = Array.isArray(input.standards)
    ? [...new Set(input.standards.filter((s) => typeof s === 'string' && s.trim()))].slice(0, 3)
    : []
  const value: WbAction = {
    id: input.id,
    horizon: input.horizon,
    action,
    purpose: (input.purpose ?? '').trim(),
    verify: (input.verify ?? '').trim(),
    standards,
    kpi: (input.kpi ?? '').trim(),
    planningState: 'queued',
    status: 'todo',
    progress: [],
    createdAt: now,
    ...(input.quadrant ? { quadrant: input.quadrant } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {})
  }
  return { ...wb, actions: [...wb.actions, value] }
}

/**
 * 普通 action 命令的防绕过校验：既不能改变纳入状态，
 * 也不能让候选被写成执行中/已完成或带上阶段记录。
 */
export function guardActionCommand(current: WbAction | undefined, next: WbAction): void {
  if (!current) {
    if (next.planningState !== 'candidate')
      throw new Error('新建策略只能是候选；要加入待办请使用“加入待办”')
    if (next.status !== 'todo' || (next.progress?.length ?? 0) > 0)
      throw new Error('候选策略不能带执行状态或阶段记录')
    return
  }
  if (next.planningState !== current.planningState)
    throw new Error('纳入状态只能通过加入待办或移回候选修改')
  if (current.planningState === 'candidate') {
    if (next.status !== 'todo') throw new Error('候选策略不能完成或放弃，请先加入待办')
    if (JSON.stringify(next.progress ?? []) !== JSON.stringify(current.progress ?? []))
      throw new Error('候选策略不能写入执行进展，请先加入待办')
  }
}
