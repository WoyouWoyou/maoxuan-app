import { createMarchService, type MarchRepository } from '@shared/engine/march'
export { createMarchService } from '@shared/engine/march'
export type { MarchRepository } from '@shared/engine/march'
export { sessionActivities, actionActivities } from '@shared/engine/march-activity'
let current: ReturnType<typeof createMarchService> | undefined
export function configureMarch(repo: MarchRepository) {
  current = createMarchService(repo)
  return current
}
function service() {
  if (!current) throw new Error('长征模块尚未初始化')
  return current
}
export const getMarchProgress = () => service().getProgress()
export const plantMarchTree = (nodeId: string, requestId: string) =>
  service().plant(nodeId, requestId)
export const collectMarchLandscape = (nodeId: string) => service().collect(nodeId)
