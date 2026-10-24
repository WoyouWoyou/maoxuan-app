import type { AIContext, Session, SessionData } from '@shared/types'
import { createSuggestionContext, assertSuggestionContext } from '../sessions/public'
export function workbenchInput(data: SessionData, purpose: string): unknown {
  const wb = data.workbench
  if (!wb) throw new Error('缺少工作台数据')
  switch (purpose) {
    case 'wb_intake':
    case 'wb_contradiction':
    case 'wb_routes':
    case 'wb_objSubj':
      return { form: wb.form, intake: wb.intake }
    case 'wb_decide':
    case 'wb_recheck':
      return { form: wb.form, intake: wb.intake, diagnosis: wb.diagnosis, decision: wb.decision }
    case 'wb_actions':
      return {
        form: wb.form,
        intake: wb.intake,
        diagnosis: wb.diagnosis,
        decision: wb.decision,
        actions: wb.actions,
        actionChecks: wb.actionChecks
      }
    case 'wb_recap':
      return {
        form: wb.form,
        intake: wb.intake,
        decision: wb.decision,
        actions: wb.actions,
        ledger: wb.ledger
      }
    default:
      throw new Error('未知的工作台建议用途')
  }
}
export const createWorkbenchContext = (s: Session, purpose: string) =>
  createSuggestionContext(s, purpose, workbenchInput(s.data, purpose))
export function assertWorkbenchContext(
  s: Session,
  value: { _context?: AIContext } | null | undefined,
  old?: { _context?: AIContext } | null
) {
  const ctx = value?._context
  assertSuggestionContext(
    s,
    value,
    old,
    ctx?.purpose ? workbenchInput(s.data, ctx.purpose) : undefined
  )
}
