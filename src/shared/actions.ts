import type {
  ActionItem,
  ActionProgress,
  ActionQuadrant,
  ActionStatus,
  Session,
  WbAction
} from './types'
import type { ReadingCommand } from './contracts/reading'
import type { WorkbenchCommand } from './contracts/workbench'

export const QUADRANTS = [
  { key: 'do', label: '立即行动', description: '重要且紧急' },
  { key: 'plan', label: '计划安排', description: '重要不紧急' },
  { key: 'delegate', label: '协调处理', description: '紧急不重要' },
  { key: 'reduce', label: '减少投入', description: '不重要不紧急' }
] as const
export interface HubAction {
  key: string
  id: string
  sessionId: string
  sessionTitle: string
  mode: Session['mode'] | 'default'
  archived: boolean
  text: string
  quadrant: ActionQuadrant | null
  dueDate: string
  status: ActionStatus
  purpose: string
  verify: string
  result: string
  progress: ActionProgress[]
  createdAt: string
  horizon?: WbAction['horizon']
}
export interface ActionEdit {
  text?: string
  quadrant?: ActionQuadrant | null
  dueDate?: string
  status?: ActionStatus
  purpose?: string
  verify?: string
}
export function collectActions(sessions: Session[]): HubAction[] {
  return sessions
    .filter((s) => !s.deletedAt)
    .flatMap((s) => {
      const base = {
        sessionId: s.id,
        sessionTitle: s.title,
        mode: s.mode,
        archived: s.status === 'archived'
      }
      if (s.mode === 'workbench')
        // 只有用户明确纳入待办的工作台行动才进入统一清单；候选只在工作台第四步可见。
        return (s.data.workbench?.actions ?? [])
          .filter((a) => a.planningState === 'queued')
          .map((a) => ({
            ...base,
            key: `${s.id}:${a.id}`,
            id: a.id,
            text: a.action,
            quadrant: a.quadrant ?? null,
            dueDate: a.dueDate ?? '',
            status: a.status,
            purpose: a.purpose,
            verify: a.verify,
            result: '',
            progress: a.progress ?? [],
            createdAt: a.createdAt,
            horizon: a.horizon
          }))
      return s.data.actions.map((a) => ({
        ...base,
        key: `${s.id}:${a.id}`,
        id: a.id,
        text: a.text,
        quadrant: a.quadrant ?? null,
        dueDate: a.dueDate,
        status: a.status,
        purpose: a.purpose ?? '',
        verify: a.verify ?? '',
        result: a.result,
        progress: a.progress ?? [],
        createdAt: a.createdAt
      }))
    })
}
/** Build against a fresh session so edits never replace unrelated progress or source fields. */
export function actionCommands(
  s: Session,
  id: string,
  edit: ActionEdit,
  progress?: ActionProgress
): {
  reading: ReadingCommand[]
  workbench: WorkbenchCommand[]
} {
  if (s.deletedAt) throw new Error('原问题已移入回收站，请先恢复')
  if (edit.text !== undefined && !edit.text.trim()) throw new Error('任务名称不能为空')
  if (s.mode === 'workbench') {
    const current = s.data.workbench?.actions.find((a) => a.id === id)
    if (!current) throw new Error('行动已被删除，请刷新列表')
    const { text, ...rest } = edit
    const value: WbAction = {
      ...current,
      ...rest,
      ...(text === undefined ? {} : { action: text.trim() }),
      progress: progress ? [...current.progress, progress] : current.progress
    }
    return { reading: [], workbench: [{ kind: 'action', value }] }
  }
  const current = s.data.actions.find((a) => a.id === id)
  if (!current) throw new Error('行动已被删除，请刷新列表')
  const value = { ...current, ...edit }
  const reading: ReadingCommand[] = []
  if (Object.keys(edit).length)
    reading.push({
      kind: 'editAction',
      id,
      value: {
        text: value.text.trim(),
        dueDate: value.dueDate,
        status: value.status,
        result: value.result,
        quadrant: value.quadrant,
        purpose: value.purpose,
        verify: value.verify
      }
    })
  if (progress) reading.push({ kind: 'actionProgress', id, value: progress })
  return { reading, workbench: [] }
}
export function newAction(
  s: Session,
  id: string,
  edit: ActionEdit,
  now: string
): {
  reading: ReadingCommand[]
  workbench: WorkbenchCommand[]
} {
  if (!edit.text?.trim()) throw new Error('请填写任务名称')
  if (s.deletedAt) throw new Error('原问题已移入回收站，请先恢复')
  const base = {
    id,
    status: 'todo' as const,
    progress: [],
    createdAt: now,
    quadrant: edit.quadrant ?? null,
    dueDate: edit.dueDate ?? '',
    purpose: edit.purpose ?? '',
    verify: edit.verify ?? ''
  }
  if (s.mode === 'workbench')
    // 从工作清单手工创建并关联工作台：创建动作本身就是明确的执行意图，直接纳入待办。
    return {
      reading: [],
      workbench: [
        {
          kind: 'createQueuedAction',
          value: {
            id,
            horizon: '7d',
            action: edit.text.trim(),
            purpose: edit.purpose ?? '',
            verify: edit.verify ?? '',
            standards: [],
            kpi: '',
            quadrant: edit.quadrant ?? null,
            ...(edit.dueDate ? { dueDate: edit.dueDate } : {})
          }
        }
      ]
    }
  const value: ActionItem = { ...base, text: edit.text.trim(), fromArticleId: null, result: '' }
  return { reading: [{ kind: 'createAction', value }], workbench: [] }
}
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function dueLabel(value: string, today = localDay()): string {
  if (!value) return '未安排'
  const day = value.slice(0, 10)
  const time = value.includes('T') ? ` ${value.slice(11, 16)}` : ''
  if (day === today) return `今天${time}`
  const d = new Date(`${day}T12:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return `${day < today ? '逾期 · ' : ''}${d.getFullYear() !== Number(today.slice(0, 4)) ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日${time}`
}

export function standaloneAction(action: ActionItem): HubAction {
  return {
    ...action,
    key: `:${action.id}`,
    sessionId: '',
    sessionTitle: '',
    mode: 'default',
    archived: false,
    quadrant: action.quadrant ?? null,
    purpose: action.purpose ?? '',
    verify: action.verify ?? '',
    progress: action.progress ?? []
  }
}
