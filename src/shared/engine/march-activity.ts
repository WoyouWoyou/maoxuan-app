import type { ActionItem, Session } from '@shared/types'
import type { MarchActivity } from '@shared/long-march'

/** Translate persisted source facts; AI drafts and repeated edits never earn points. */
export function actionActivities(action: ActionItem, scope: string): MarchActivity[] {
  if (action.id.startsWith('sync-conflict:')) return []
  const events: MarchActivity[] = []
  const prefix = JSON.stringify([scope, action.id])
  for (const p of action.progress)
    if (p.text.trim())
      events.push({ id: `${prefix}:progress:${p.id}`, kind: 'action', createdAt: p.createdAt })
  if (action.status === 'done')
    events.push({ id: `${prefix}:done`, kind: 'action', createdAt: action.createdAt })
  return events
}
export function sessionActivities(session: Session): MarchActivity[] {
  if (session.deletedAt || session.id.startsWith('sync-conflict:')) return []
  const events: MarchActivity[] = []
  for (const reading of session.data.readings) {
    const prefix = JSON.stringify([session.id, reading.articleId])
    if (reading.readDone)
      events.push({ id: `${prefix}:read`, kind: 'reading', createdAt: reading.startedAt })
    if (reading.notesDone && Object.values(reading.notes).some((v) => v.trim()))
      events.push({ id: `${prefix}:notes`, kind: 'reflection', createdAt: reading.startedAt })
    for (const r of reading.reflections)
      if (r.text.trim())
        events.push({
          id: `${prefix}:reflection:${r.id}`,
          kind: 'reflection',
          createdAt: r.createdAt
        })
  }
  for (const action of session.data.actions) events.push(...actionActivities(action, session.id))
  for (const action of session.data.workbench?.actions ?? []) {
    if (action.planningState !== 'queued') continue
    events.push(
      ...actionActivities(
        {
          ...action,
          text: action.action,
          fromArticleId: null,
          dueDate: action.dueDate ?? '',
          result: ''
        },
        session.id
      )
    )
  }
  return events
}
