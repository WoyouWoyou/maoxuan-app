import { createActionClassifier } from '@shared/engine/action-classifier'
import { randomUUID } from 'node:crypto'
import {
  actionCommands,
  collectActions,
  standaloneAction,
  QUADRANTS,
  type ActionEdit,
  type HubAction
} from '@shared/actions'
import { actionEditSchema } from '@shared/contracts/action-planning'
import { actionSchema } from '@shared/contracts/state-schema'
import type { ActionReference, ClassificationResult } from '@shared/contracts/action-planning'
import { array, object, oneOf, text } from '@shared/contracts/validation'
import type { ActionItem, ActionQuadrant, Session } from '@shared/types'
import { getSession } from '../sessions/public'
import { getSettings } from '../settings/public'
import { callJson, withModelContext } from '../model-runtime/public'
import { applyCommands } from '../reading/public'
import { applyWorkbench } from '../workbench/public'

export interface ActionRepository {
  list(): ActionItem[]
  get(id: string): ActionItem | undefined
  save(action: ActionItem): void
}
let repository: ActionRepository
export function configureActions(value: ActionRepository): void {
  repository = value
}
export function listActions(): ActionItem[] {
  return repository.list()
}
export function createAction(edit: ActionEdit): ActionItem {
  actionEditSchema(edit, 'action')
  if (!edit.text?.trim()) throw new Error('请填写任务名称')
  const action: ActionItem = {
    id: randomUUID(),
    text: edit.text.trim(),
    status: 'todo',
    quadrant: edit.quadrant ?? null,
    dueDate: edit.dueDate ?? '',
    purpose: edit.purpose ?? '',
    verify: edit.verify ?? '',
    fromArticleId: null,
    result: '',
    progress: [],
    createdAt: new Date().toISOString()
  }
  actionSchema(action, 'action')
  repository.save(action)
  return action
}
export function editAction(id: string, edit: ActionEdit, progress?: string): ActionItem {
  actionEditSchema(edit, 'action')
  const current = repository.get(id)
  if (!current) throw new Error('行动已被删除，请刷新列表')
  if (edit.text !== undefined && !edit.text.trim()) throw new Error('任务名称不能为空')
  const next = {
    ...current,
    ...edit,
    text: edit.text === undefined ? current.text : edit.text.trim(),
    progress: progress?.trim()
      ? [
          ...current.progress,
          { id: randomUUID(), text: progress.trim(), createdAt: new Date().toISOString() }
        ]
      : current.progress
  }
  actionSchema(next, 'action')
  repository.save(next)
  return next
}
const classifier = createActionClassifier({
  randomUUID,
  getSession,
  getSettings,
  callJson,
  withModelContext,
  applyCommands,
  applyWorkbench,
  editAction,
  listActions
})
export const classifyActions = classifier.classifyActions
