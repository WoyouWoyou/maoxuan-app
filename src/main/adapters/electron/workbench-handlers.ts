import type { WbRecapInput } from '@shared/types'
import { generateWorkbench, applyWorkbench } from '../../modules/workbench/public'
import { register } from './transport'
export function registerWorkbenchHandlers(): void {
  register('wb:apply', applyWorkbench)
  for (const operation of [
    'intake',
    'contradiction',
    'routes',
    'objSubj',
    'decide',
    'recheck',
    'actions',
    'recap'
  ] as const)
    register(`wb:${operation}`, (id: string, input?: WbRecapInput) =>
      generateWorkbench(operation, id, input)
    )
}
