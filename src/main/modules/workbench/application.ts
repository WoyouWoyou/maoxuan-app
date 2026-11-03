import type { WbRecapInput, WbDecisionRevision } from '@shared/types'
import { selectedWorkbench } from '@shared/workbench'
import { thinkingResultSchema } from '@shared/contracts/state-schema'
import { array, bool, object, text, oneOf } from '@shared/contracts/validation'
import {
  intakeSchema,
  contradictionSchema,
  routesSchema,
  objSubjSchema,
  decisionSchema,
  checkSchema,
  wbActionSchema,
  ledgerSchema
} from '@shared/contracts/state-schema'
import { requireSession } from '../sessions/public'
import { withModelContext } from '../model-runtime/public'
import { getSettings } from '../settings/public'
import { scopeOf } from '../library/public'
import * as ai from './generation'
import { createWorkbenchContext, assertWorkbenchContext } from './context'
const operations = {
  think: ai.wbThink,
  intake: ai.wbIntake,
  contradiction: ai.wbContradiction,
  routes: ai.wbRoutes,
  objSubj: ai.wbObjSubj,
  decide: ai.wbDecide,
  recheck: ai.wbRecheck,
  actions: ai.wbActions,
  recap: ai.wbRecap
}
const schemas = {
  think: thinkingResultSchema,
  intake: intakeSchema,
  contradiction: contradictionSchema,
  routes: routesSchema,
  objSubj: objSubjSchema,
  decide: decisionSchema,
  recheck: array(checkSchema),
  actions: object({ actions: array(wbActionSchema), checks: array(checkSchema) }),
  recap: object({
    entry: ledgerSchema,
    newFacts: array(object({ id: text, kind: text, content: text, confidence: text })),
    rediagnose: bool,
    rediagnoseReason: text
  })
}
export async function generateWorkbench<K extends keyof typeof operations>(
  operation: K,
  id: string,
  input?: WbRecapInput | WbDecisionRevision
): Promise<Awaited<ReturnType<(typeof operations)[K]>>> {
  const session = requireSession(id),
    wb = session.data.workbench
  if (session.mode !== 'workbench' || !wb) throw new Error('这个会话不是工作台模式')
  const ctx = createWorkbenchContext(session, `wb_${operation}`)
  if (operation === 'recap')
    object({ progress: text, factChanges: text, judgmentsToFix: text })(input, 'recap')
  if (operation === 'decide' && input !== undefined)
    object({ route: oneOf('steady', 'breakthrough', 'defensive'), primaryContradiction: text })(
      input,
      'revision'
    )
  const result = await withModelContext(
    { purpose: `wb_${operation}`, sessionId: id, ...scopeOf(session.data) },
    () =>
      operation === 'decide'
        ? ai.wbDecide(
            getSettings('workbench'),
            selectedWorkbench(wb),
            input as WbDecisionRevision | undefined
          )
        : operation === 'recap'
          ? ai.wbRecap(getSettings('workbench'), selectedWorkbench(wb), input as WbRecapInput)
          : operations[operation as Exclude<K, 'decide' | 'recap'>](
              getSettings('workbench'),
              ['recheck', 'actions'].includes(operation) ? selectedWorkbench(wb) : wb
            )
  )
  schemas[operation](result, 'workbenchResult')
  assertWorkbenchContext(requireSession(id), { _context: ctx })
  if (operation === 'recheck')
    for (const c of result as Awaited<ReturnType<typeof ai.wbRecheck>>) c._context = ctx
  else if (operation === 'actions') {
    const r = result as Awaited<ReturnType<typeof ai.wbActions>>
    for (const a of r.actions) a._context = ctx
    for (const c of r.checks) c._context = ctx
  } else if (operation === 'recap')
    (result as Awaited<ReturnType<typeof ai.wbRecap>>).entry._context = ctx
  else {
    Object.assign(result, { _context: ctx })
    if (operation === 'think')
      for (const a of (result as Awaited<ReturnType<typeof ai.wbThink>>).actions) a._context = ctx
  }
  return result as Awaited<ReturnType<(typeof operations)[K]>>
}
