import { wbStepUnlocked, blockingChecks, ruleChecksDecision, mergeWaived } from '@shared/workbench'
import type { Session, SessionData, StepKey, WbStepKey } from '@shared/types'
import { assertWorkbenchContext } from './context'
export function validateWorkbenchSession(
  session: Session,
  next: SessionData,
  restoring = false,
  step?: StepKey
): void {
  const old = session.data.workbench,
    wb = next.workbench
  if (!old || !wb) throw new Error('缺少工作台数据')
  if (!restoring) {
    if (step && step !== session.currentStep) {
      const gate = wbStepUnlocked(wb, step as WbStepKey)
      if (!gate.ok) throw new Error(gate.reason)
    }
    if (wb.decision?.confirmed && !old.decision?.confirmed) {
      const checks = [
        ...mergeWaived(wb.decision.checks, ruleChecksDecision(wb)),
        ...wb.decision.checks.filter((c) => c.source === 'ai')
      ]
      if (blockingChecks(checks).length) throw new Error('请先处理或确认决策检查项')
    }
    assertWorkbenchContext(session, wb.intake, old.intake)
    assertWorkbenchContext(session, wb.decision, old.decision)
    for (const k of ['contradiction', 'routes', 'objSubj'] as const)
      assertWorkbenchContext(session, wb.diagnosis[k], old.diagnosis[k])
    for (const c of wb.decision?.checks ?? [])
      assertWorkbenchContext(
        session,
        c,
        old.decision?.checks.find((x) => x.id === c.id)
      )
    for (const c of wb.actionChecks)
      assertWorkbenchContext(
        session,
        c,
        old.actionChecks.find((x) => x.id === c.id)
      )
    for (const a of wb.actions)
      assertWorkbenchContext(
        session,
        a,
        old.actions.find((x) => x.id === a.id)
      )
    for (const e of wb.ledger)
      assertWorkbenchContext(
        session,
        e,
        old.ledger.find((x) => x.id === e.id)
      )
    if (old.ledger.some((e, i) => JSON.stringify(wb.ledger[i]) !== JSON.stringify(e)))
      throw new Error('项目台账只能追加')
  }
  for (const values of [wb.actions, wb.ledger, wb.intake?.facts ?? []]) {
    if (new Set(values.map((x) => x.id)).size !== values.length)
      throw new Error('工作台记录标识重复')
  }
  // 候选只是选项目，不能带执行痕迹；这一不变量同时挡住绕过命令直接改状态的写入。
  for (const a of wb.actions)
    if (a.planningState === 'candidate' && (a.status !== 'todo' || (a.progress?.length ?? 0) > 0))
      throw new Error('候选策略不能带执行状态或阶段记录')
}
