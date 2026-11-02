import {
  STATION_WAIT_MS,
  MARCH_NODES,
  TREE_COST,
  type MarchActivity,
  type MarchProgress
} from '@shared/long-march'
export interface MarchRepository {
  transaction<T>(work: () => T): T
  addActivities(events: MarchActivity[]): void
  rewards(): { earned: number; todayEarned: number }
  activities(): MarchProgress['counts']
  plantings(): { nodeId: string; requestId: string; plantedAt: string }[]
  addPlant(nodeId: string, requestId: string): void
  collected(): string[]
  collect(nodeId: string): void
}
export function createMarchService(repo: MarchRepository, now = () => Date.now()) {
  function getProgress(): MarchProgress {
    const counts = repo.activities()
    const plantings = repo.plantings()
    const plants: Record<string, number> = {}
    for (const row of plantings) plants[row.nodeId] = (plants[row.nodeId] ?? 0) + 1
    const { earned, todayEarned } = repo.rewards()
    const unlockAt: Record<string, string> = {}
    for (const row of plantings) {
      if (!unlockAt[row.nodeId])
        unlockAt[row.nodeId] = new Date(
          new Date(row.plantedAt).getTime() + STATION_WAIT_MS
        ).toISOString()
    }
    const unlocked = MARCH_NODES.filter(
      (n) => (plants[n.id] ?? 0) >= n.target && now() >= new Date(unlockAt[n.id]).getTime()
    ).map((n) => n.id)
    const spent = plantings.length * TREE_COST
    return {
      counts,
      todayEarned,
      unlockAt,
      unlocked,
      plants,
      earned,
      spent,
      balance: earned - spent,
      completed: unlocked.length === MARCH_NODES.length,
      collected: repo.collected()
    }
  }
  function plant(nodeId: string, requestId: string): MarchProgress {
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200)
      throw new Error('无效的植树请求')
    const index = MARCH_NODES.findIndex((n) => n.id === nodeId)
    if (index < 0) throw new Error('未知的长征节点')
    return repo.transaction(() => {
      const previous = repo.plantings().find((p) => p.requestId === requestId)
      if (previous) {
        if (previous.nodeId !== nodeId) throw new Error('请求标识已用于其他节点')
        return getProgress()
      }
      const state = getProgress(),
        node = MARCH_NODES[index]
      if (index > 0 && !state.unlocked.includes(MARCH_NODES[index - 1].id))
        throw new Error('请先完成上一站植树并等待满3天，让成长沿着长征路线前行')
      if ((state.plants[nodeId] ?? 0) >= node.target) throw new Error('这一站已经成林')
      if (state.balance < TREE_COST) throw new Error('成长值不足，完成阅读、思考或行动记录后再来')
      repo.addPlant(nodeId, requestId)
      return getProgress()
    })
  }
  function collect(nodeId: string): MarchProgress {
    const node = MARCH_NODES.find((n) => n.id === nodeId)
    if (!node) throw new Error('未知的长征节点')
    return repo.transaction(() => {
      if (!getProgress().unlocked.includes(nodeId))
        throw new Error('完成本站植树并等待满3天后才能收藏风景')
      repo.collect(nodeId)
      return getProgress()
    })
  }
  return {
    getProgress,
    plant,
    collect,
    observe: (events: MarchActivity[]) =>
      repo.transaction(() => {
        const before = repo.rewards().earned
        repo.addActivities(events)
        return repo.rewards().earned > before
      })
  }
}
