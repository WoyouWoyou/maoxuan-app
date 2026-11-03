import { randomUUID } from 'node:crypto'
import { callJson } from '../model-runtime/public'
import { createWorkbenchAI } from '@shared/engine/workbench-ai'
export const {
  wbThink,
  wbIntake,
  wbContradiction,
  wbRoutes,
  wbObjSubj,
  wbDecide,
  wbRecheck,
  wbActions,
  wbRecap,
  buildWbChatMessages
} = createWorkbenchAI({ callJson, randomUUID })
