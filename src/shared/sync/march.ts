import { ACTIVITY_POINTS, MARCH_NODES, type MarchActivity } from '../long-march'

export interface MarchState {
  events: (MarchActivity & { points: number; day: string | null })[]
  plants: { nodeId: string; requestId: string; plantedAt: string }[]
  collected: string[]
}

const nodes = new Map(MARCH_NODES.map((node) => [node.id, node.target]))
const validDate = (date: unknown): date is string =>
  typeof date === 'string' && Number.isFinite(Date.parse(date))
const validId = (id: unknown, max: number): id is string =>
  typeof id === 'string' && !!id.trim() && id.length <= max

export function validateMarchState(state: MarchState): void {
  if (
    !state ||
    !Array.isArray(state.events) ||
    state.events.length > 100000 ||
    !Array.isArray(state.plants) ||
    state.plants.length > 1000 ||
    !Array.isArray(state.collected) ||
    state.collected.length > 1000 ||
    state.events.some(
      (event) =>
        !event ||
        !validId(event.id, 2048) ||
        !['reading', 'reflection', 'action', 'journal'].includes(event.kind) ||
        !validDate(event.createdAt) ||
        !Number.isInteger(event.points) ||
        event.points < 0 ||
        event.points > ACTIVITY_POINTS ||
        !(
          event.day === null ||
          (typeof event.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.day))
        )
    ) ||
    state.plants.some(
      (plant) =>
        !plant ||
        !nodes.has(plant.nodeId) ||
        !validId(plant.requestId, 200) ||
        !validDate(plant.plantedAt)
    ) ||
    state.collected.some((id) => !nodes.has(id))
  )
    throw Error('无效的成就同步数据')
}

const byDate = (a: string, b: string) => Date.parse(a) - Date.parse(b)

/** Merge earned credit and completed milestones without awarding the same event twice. */
export function mergeMarchState(a: MarchState, b: MarchState): MarchState {
  const events = new Map<string, MarchState['events'][number]>()
  for (const event of [...a.events, ...b.events].sort(
    (x, y) =>
      y.points - x.points ||
      (x.day ?? '').localeCompare(y.day ?? '') ||
      byDate(x.createdAt, y.createdAt) ||
      x.createdAt.localeCompare(y.createdAt) ||
      x.kind.localeCompare(y.kind)
  )) {
    if (!events.has(event.id)) events.set(event.id, event)
  }
  const plants = new Map<string, MarchState['plants'][number]>()
  const counts = new Map<string, number>()
  for (const plant of [...a.plants, ...b.plants].sort(
    (x, y) =>
      byDate(x.plantedAt, y.plantedAt) ||
      x.plantedAt.localeCompare(y.plantedAt) ||
      x.requestId.localeCompare(y.requestId) ||
      x.nodeId.localeCompare(y.nodeId)
  )) {
    const count = counts.get(plant.nodeId) ?? 0
    if (plants.has(plant.requestId) || count >= (nodes.get(plant.nodeId) ?? 0)) continue
    plants.set(plant.requestId, plant)
    counts.set(plant.nodeId, count + 1)
  }
  return {
    events: [...events.values()].sort((x, y) => x.id.localeCompare(y.id)),
    plants: [...plants.values()],
    collected: [...new Set([...a.collected, ...b.collected])].sort()
  }
}
