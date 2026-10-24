import type { ClassificationResult } from '@shared/contracts/action-planning'
import { createContext, useContext } from 'react'
import type { Session } from '@shared/types'
import type { ActionEdit, HubAction } from '@shared/actions'
export type ActionHub = {
  sessions: Session[]
  tasks: HubAction[]
  loading: boolean
  error: string
  reload: () => Promise<void>
  classify: (tasks: HubAction[]) => Promise<ClassificationResult>
  edit: (task: HubAction, change: ActionEdit, progress?: string) => Promise<void>
  add: (sessionId: string, change: ActionEdit) => Promise<string>
}
export const ActionHubContext = createContext<ActionHub | null>(null)
export function useActionHub(): ActionHub {
  const value = useContext(ActionHubContext)
  if (!value) throw new Error('行动中心尚未初始化')
  return value
}
