import { landscapeInfo } from './landscape-catalog'
import type { MarchNode, MarchProgress } from '@shared/long-march'
export const grown = (progress: MarchProgress, node: MarchNode) =>
  progress.unlocked.includes(node.id)
export const sceneTitle = (node: MarchNode) => landscapeInfo(node).title
