import type {
  WbIntake,
  WbContradiction,
  WbRoutes,
  WbObjSubj,
  WbDecision,
  WbCheck,
  WbAction,
  WbRecapInput,
  WbRecapResult
} from '@shared/types'
import { getSettings } from '../sqlite/session-repository'
import {
  wbIntake,
  wbContradiction,
  wbRoutes,
  wbObjSubj,
  wbDecide,
  wbRecheck,
  wbActions,
  wbRecap
} from '../../modules/workbench/public'
import { register, requireSession, requireArticle, requireWorkbench, toError } from './transport'
export function registerWorkbenchHandlers(): void {
  register<[string], WbIntake>('wb:intake', (sessionId) =>
    wbIntake(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string], WbContradiction>('wb:contradiction', (sessionId) =>
    wbContradiction(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string], WbRoutes>('wb:routes', (sessionId) =>
    wbRoutes(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string], WbObjSubj>('wb:objSubj', (sessionId) =>
    wbObjSubj(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string], WbDecision>('wb:decide', (sessionId) =>
    wbDecide(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string], WbCheck[]>('wb:recheck', (sessionId) =>
    wbRecheck(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string], { actions: WbAction[]; checks: WbCheck[] }>('wb:actions', (sessionId) =>
    wbActions(getSettings('workbench'), requireWorkbench(sessionId))
  )
  register<[string, WbRecapInput], WbRecapResult>('wb:recap', (sessionId, input) =>
    wbRecap(getSettings('workbench'), requireWorkbench(sessionId), input)
  )
}
