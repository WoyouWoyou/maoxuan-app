import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/adapters/sqlite/database'
import { createMarchRepository } from '../src/main/adapters/sqlite/long-march-repository'
import { createMarchObservedRepositories } from '../src/main/adapters/sqlite/march-observer'
import { createMarchService, sessionActivities } from '../src/main/modules/long-march/public'
import { MARCH_NODES } from '../src/shared/long-march'
import {
  emptySessionData,
  emptyWorkbench,
  type Session,
  type ActionItem
} from '../src/shared/types'
import { validateIpcArguments } from '../src/shared/contracts/ipc'
let db: Database.Database
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-31T04:00:00Z'))
  db = openDatabase(':memory:')
})
afterEach(() => { db.close(); vi.useRealTimers() })
const task = (): ActionItem => ({
  id: 'a',
  text: '调查',
  fromArticleId: null,
  dueDate: '',
  result: '',
  status: 'done',
  progress: [{ id: 'p', text: '已访谈', createdAt: '2026-10-30' }],
  createdAt: '2026-10-30'
})
const source = (): Session => ({
  id: 's',
  title: '问题',
  mode: 'reading',
  status: 'active',
  deletedAt: null,
  currentStep: 'problem',
  stateVersion: 0,
  versionNo: 1,
  bookId: 'maoxuan',
  bookTitle: '毛选',
  createdAt: '2026-10-30',
  updatedAt: '2026-10-30',
  data: emptySessionData()
})
const earn = (march: ReturnType<typeof createMarchService>, count: number) =>
  march.observe(
    Array.from({ length: count }, (_, i) => ({
      id: `earned-${i}`,
      kind: 'reflection',
      createdAt: '2026-10-30'
    }))
  )
describe('Long March domain and SQLite integration', () => {
  it('does not let unearned growth or out-of-order nodes spend points; request retries are idempotent', () => {
    const march = createMarchService(createMarchRepository(db))
    expect(() => march.plant('yudu', 'a')).toThrow('成长值不足')
    earn(march, 5)
    expect(() => march.plant('zunyi', 'a')).toThrow('上一站')
    const planted = march.plant('yudu', 'a')
    expect(planted.balance).toBe(10)
    expect(march.plant('yudu', 'a')).toEqual(planted)
    expect(() => march.plant('xiangjiang', 'a')).toThrow('其他节点')
    expect(() => march.plant('missing', 'b')).toThrow('未知')
    expect(() => march.plant('yudu', ' ')).toThrow('无效')
    expect(() => march.collect('yudu')).toThrow('完成本站')
  })
  it('unlocks every node in route order and persists completion and collection across service recreation', () => {
    const march = createMarchService(createMarchRepository(db))
    for (let day = 0; day < 24; day++) {
      vi.setSystemTime(Date.now() + 86400000)
      march.observe(Array.from({ length: 2 }, (_, i) => ({ id: `day-${day}-${i}`, kind: 'reading', createdAt: new Date().toISOString() })))
    }
    for (const node of MARCH_NODES) {
      for (let i = 0; i < node.target; i++) march.plant(node.id, `${node.id}-${i}`)
      expect(() => march.collect(node.id)).toThrow('满3天')
      vi.setSystemTime(Date.now() + 72 * 3600000 - 1)
      expect(() => march.collect(node.id)).toThrow('满3天')
      vi.setSystemTime(Date.now() + 1)
      march.collect(node.id)
      march.collect(node.id)
      expect(() => march.plant(node.id, `${node.id}-extra`)).toThrow('已经成林')
    }
    const next = createMarchService(createMarchRepository(db)).getProgress()
    expect(next).toMatchObject({ earned: 480, spent: 480, balance: 0, completed: true })
    expect(next.collected).toHaveLength(12)
  })
  it('deduplicates persisted reading/notes/reflection/action facts and excludes drafts, blanks and candidates', () => {
    const march = createMarchService(createMarchRepository(db)),
      repos = createMarchObservedRepositories(db, march),
      s = source()
    repos.sessions.insert(s)
    s.data.readings.push({
      articleId: 'chapter',
      title: '章节',
      startedAt: '2026-10-30',
      focusQuestion: '',
      passages: [],
      reflections: [
        { id: 'r', paragraphIndex: null, quote: '', text: '我的思考', createdAt: '2026-10-30' },
        { id: 'blank', paragraphIndex: null, quote: '', text: ' ', createdAt: '2026-10-30' }
      ],
      readDone: true,
      notes: { coreMethod: '联系实际', relatedProblem: '', action: '' },
      feedback: null,
      notesDone: true
    })
    s.data.actions.push(task())
    s.data.workbench = emptyWorkbench('项目')
    s.data.workbench.actions.push({
      ...task(),
      action: '建议',
      purpose: '',
      verify: '',
      standards: [],
      kpi: '',
      horizon: '7d',
      planningState: 'candidate'
    })
    repos.sessions.save(s)
    repos.sessions.save(s)
    expect(march.getProgress().counts).toEqual({ reading: 1, reflection: 2, action: 2, journal: 0 })
    s.data.readings[0].reflections[0].text = '编辑后的思考'
    repos.sessions.save(s)
    repos.sessions.delete(s.id)
    expect(march.getProgress().earned).toBe(20)
    expect(sessionActivities({ ...s, deletedAt: '2026-10-30' })).toEqual([])
  })
  it('backfills existing records once, observes independent tasks, and rolls rewards back with source writes', () => {
    const march = createMarchService(createMarchRepository(db)),
      repos = createMarchObservedRepositories(db, march)
    repos.actions.save(task())
    createMarchObservedRepositories(db, march)
    expect(march.getProgress().earned).toBe(20)
    expect(() =>
      db.transaction(() => {
        repos.actions.save({ ...task(), id: 'new' })
        throw new Error('rollback')
      })()
    ).toThrow('rollback')
    expect(repos.actions.get('new')).toBeUndefined()
    expect(march.getProgress().earned).toBe(20)
    const s = source()
    repos.sessions.insert(s)
    expect(() =>
      db.transaction(() => {
        s.data.actions.push({ ...task(), id: 'session-new' })
        repos.sessions.save(s)
        throw new Error('rollback')
      })()
    ).toThrow('rollback')
    expect(repos.sessions.get(s.id)?.data.actions).toEqual([])
    expect(march.getProgress().earned).toBe(20)
  })
  it('caps receipt-day rewards and never re-awards over-cap records on a later day', () => {
    const march = createMarchService(createMarchRepository(db))
    earn(march, 20)
    expect(march.getProgress()).toMatchObject({ earned: 20, todayEarned: 20 })
    vi.setSystemTime(Date.now() + 86400000)
    earn(march, 20)
    expect(march.getProgress()).toMatchObject({ earned: 20, todayEarned: 0 })
    march.observe([{ id: 'fresh', kind: 'journal', createdAt: '2000-01-01' }])
    expect(march.getProgress()).toMatchObject({ earned: 30, todayEarned: 10 })
  })
  it('validates IPC payloads rather than accepting renderer-provided points', () => {
    expect(() => validateIpcArguments('march:plant', ['yudu', 'request'])).not.toThrow()
    expect(() => validateIpcArguments('march:plant', ['yudu', 500])).toThrow()
    expect(() => validateIpcArguments('march:get', [100])).toThrow()
    expect(() => validateIpcArguments('march:award', [100])).toThrow()
  })
})
