import { createMarchService } from '@shared/engine/march'
import { sessionActivities, actionActivities } from '@shared/engine/march-activity'
import { ACTIVITY_POINTS, DAILY_GROWTH_LIMIT, type MarchActivity } from '@shared/long-march'
import type { Entity } from '../domain/models'
export interface MarchState {
  events: (MarchActivity & { points: number; day: string })[]
  plants: { nodeId: string; requestId: string; plantedAt: string }[]
  collected: string[]
}
export function mobileMarch(
  prior: MarchState | undefined,
  entities: Entity[],
  now = () => new Date()
) {
  const state: MarchState = structuredClone(prior ?? { events: [], plants: [], collected: [] })
  const day = () => now().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const service = createMarchService(
    {
      transaction: (work) => work(),
      addActivities: (events) => {
        for (const e of events) {
          if (state.events.some((x) => x.id === e.id)) continue
          const today = state.events
            .filter((x) => x.day === day())
            .reduce((n, x) => n + x.points, 0)
          state.events.push({
            ...e,
            day: day(),
            points: Math.max(0, Math.min(ACTIVITY_POINTS, DAILY_GROWTH_LIMIT - today))
          })
        }
      },
      rewards: () => ({
        earned: state.events.reduce((n, x) => n + x.points, 0),
        todayEarned: state.events.filter((x) => x.day === day()).reduce((n, x) => n + x.points, 0)
      }),
      activities: () => {
        const counts = { reading: 0, reflection: 0, action: 0, journal: 0 }
        for (const e of state.events) counts[e.kind]++
        return counts
      },
      plantings: () => state.plants,
      addPlant: (nodeId, requestId) => {
        state.plants.push({ nodeId, requestId, plantedAt: now().toISOString() })
      },
      collected: () => state.collected,
      collect: (id) => {
        if (!state.collected.includes(id)) state.collected.push(id)
      }
    },
    () => now().getTime()
  )
  for (const e of entities) {
    if (e.kind !== 'desktop') continue
    const p = e.payload
    if (p.type === 'session') service.observe(sessionActivities(p.value.session))
    if (p.type === 'action') service.observe(actionActivities(p.value, 'standalone'))
    if (p.type === 'journal')
      service.observe(
        p.value.notes
          .filter((n) => n.completedAt)
          .map((n) => ({
            id: `journal:${n.id}:completed`,
            kind: 'journal',
            createdAt: n.completedAt!
          }))
      )
  }
  return { state, service }
}
