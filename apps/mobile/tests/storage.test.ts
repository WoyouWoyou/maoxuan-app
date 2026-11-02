import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { createBrowserStore } from '../src/adapters/indexeddb'
import { createAppClient } from '../src/application/client'
import { transition, newMeta, type Note, type Article } from '../src/domain/models'
const book: Article = {
  id: 'builtin',
  title: '实践论',
  content: '认识始于实践。\n实践检验认识。',
  revisionId: 'immutable-v1',
  volume: '第一卷',
  isCore: true,
  coreOrder: 1
}
const note = (): Note => ({
  ...newMeta(),
  kind: 'note',
  title: '笔记',
  body: '旧内容',
  folder: '读书笔记'
})
const setup = async () => {
  const store = await createBrowserStore(crypto.randomUUID())
  return { store, client: createAppClient(store, [book]) }
}
describe('atomic storage contract', () => {
  it('commits entity, history and outbox once even after receipt loss', async () => {
    const { store } = await setup(),
      entity = note()
    const command = { entity, expectedVersion: 0, operationId: 'operation-1' }
    await store.commit(command)
    await store.commit(command)
    const s = await store.snapshot()
    expect(s.entities).toEqual([entity])
    expect(s.history).toHaveLength(1)
    expect(s.outbox).toHaveLength(1)
    await expect(
      store.commit({ ...command, entity: { ...entity, body: 'changed' } })
    ).rejects.toThrow()
    expect(await store.snapshot()).toEqual(s)
  })
  it('rejects stale concurrent writes without partial side effects', async () => {
    const { store, client } = await setup(),
      saved = await client.save(note())
    const results = await Promise.allSettled([
      client.save({ ...saved, body: 'A' }),
      client.save({ ...saved, body: 'B' })
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const s = await store.snapshot()
    expect(s.history).toHaveLength(2)
    expect(s.outbox).toHaveLength(2)
    expect(s.entities[0].version).toBe(2)
  })
  it('persists across adapter instances', async () => {
    const name = crypto.randomUUID(),
      first = await createBrowserStore(name),
      entity = note()
    await first.commit({ entity, expectedVersion: 0, operationId: 'one' })
    expect((await (await createBrowserStore(name)).snapshot()).entities).toEqual([entity])
  })
})
describe('domain rules and source validation', () => {
  it('requires explicit enqueue and disallows returning progressed work', () => {
    const action = {
      ...newMeta(),
      kind: 'action' as const,
      title: '实践',
      planningState: 'candidate' as const,
      status: 'todo' as const,
      progress: ''
    }
    expect(() => transition(action, 'complete')).toThrow()
    const queued = transition(action, 'enqueue')
    expect(transition(queued, 'complete').status).toBe('done')
    expect(() => transition({ ...queued, progress: '已尝试' }, 'return')).toThrow()
  })
  it('disallows bypassing explicit action commands through generic save', async () => {
    const { client } = await setup()
    const candidate = await client.save({
      ...newMeta(),
      kind: 'action',
      title: '行动',
      planningState: 'candidate',
      status: 'todo',
      progress: ''
    })
    if (candidate.kind !== 'action') throw new Error('unexpected type')
    await expect(client.save({ ...candidate, planningState: 'queued' })).rejects.toThrow('明确')
    const queued = await client.executeAction(candidate, 'enqueue')
    expect(queued.kind === 'action' && queued.planningState).toBe('queued')
  })
  it('rejects forged quotes and invalid action snapshots before any write', async () => {
    const { client, store } = await setup()
    await expect(
      client.save({
        ...note(),
        source: {
          articleId: book.id,
          revisionId: book.revisionId,
          paragraph: 0,
          quote: '伪造的原文'
        }
      })
    ).rejects.toThrow('引用')
    await expect(
      client.save({
        ...newMeta(),
        kind: 'action',
        title: '非法候选',
        planningState: 'candidate',
        status: 'done',
        progress: ''
      })
    ).rejects.toThrow()
    expect((await store.snapshot()).entities).toHaveLength(0)
  })
})
describe('backup restore', () => {
  it('round trips Unicode content, clears old transport state, and rejects corruption without changing current data', async () => {
    const { client, store } = await setup()
    await client.save(note())
    const text = await client.exportBackup()
    await client.save({ ...note(), title: '额外笔记' })
    const corrupt = JSON.stringify({ ...JSON.parse(text), sha256: 'wrong' })
    await expect(client.restoreBackup(corrupt)).rejects.toThrow('校验失败')
    expect((await store.snapshot()).entities).toHaveLength(2)
    await client.restoreBackup(text)
    const s = await store.snapshot()
    expect(s.entities).toHaveLength(1)
    expect(s.outbox).toHaveLength(0)
    expect(s.history).toHaveLength(1)
  })
})
