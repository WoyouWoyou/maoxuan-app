import { createMarchService } from '@shared/engine/march'
import { sessionActivities, actionActivities } from '@shared/engine/march-activity'
import { ACTIVITY_POINTS, DAILY_GROWTH_LIMIT } from '@shared/long-march'
import type { MarchState } from '@shared/sync/march'
import type { Entity } from '../domain/models'
export function mobileMarch(
  prior: MarchState | undefined,
  entities: Entity[],
  now = () => new Date()
) {
  const state: MarchState = structuredClone(prior ?? { events: [], plants: [], collected: [] })
  const day = () => now().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const recorded = new Set(state.events.map((event) => event.id))
  const earnedByDay = new Map<string | null, number>()
  for (const event of state.events)
    earnedByDay.set(event.day, (earnedByDay.get(event.day) ?? 0) + event.points)
  const service = createMarchService(
    {
      transaction: (work) => work(),
      addActivities: (events) => {
        const date = day()
        let total = earnedByDay.get(date) ?? 0
        for (const event of events) {
          if (recorded.has(event.id)) continue
          const points = Math.max(0, Math.min(ACTIVITY_POINTS, DAILY_GROWTH_LIMIT - total))
          recorded.add(event.id)
          total += points
          state.events.push({ ...event, day: date, points })
        }
        earnedByDay.set(date, total)
      },
      rewards: () => ({
        earned: state.events.reduce((n, x) => n + x.points, 0),
        todayEarned: earnedByDay.get(day()) ?? 0
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
          .filter((n) => n.completedAt && !n.id.startsWith('sync-conflict:'))
          .map((n) => ({
            id: `journal:${n.id}:completed`,
            kind: 'journal',
            createdAt: n.completedAt!
          }))
      )
  }
  return { state, service }
}
