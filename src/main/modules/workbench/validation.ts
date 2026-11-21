import { assertWorkbenchContext } from './context'
import { createWorkbenchValidator } from '@shared/engine/workbench-validation'
export const { validateWorkbenchSession } = createWorkbenchValidator({ assertWorkbenchContext })
