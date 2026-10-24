import { describe, expect, it } from 'vitest'
import {
  emptySessionData,
  emptyWorkbench,
  type Session,
  type SessionData,
  type WbAction,
  type WorkbenchData
} from '../src/shared/types'
import {
  applyWorkbenchCommands,
  validateWorkbenchSession
} from '../src/main/modules/workbench/public'
import {
  enqueueCandidates,
  returnActionsToCandidates
} from '../src/main/modules/workbench/action-planning'
import { workbenchCommands } from '../src/shared/contracts/workbench'

type ActionOverrides = Partial<Omit<WbAction, 'id'>>

function makeAction(id: string, overrides: ActionOverrides = {}): WbAction {
  return {
    id,
    horizon: '7d',
    action: `动作 ${id}`,
    purpose: `目的 ${id}`,
    verify: `验证 ${id}`,
    standards: ['实事求是'],
    kpi: `指标 ${id}`,
    planningState: 'candidate',
    status: 'todo',
    progress: [],
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides
  }
}

function makeWorkbench(actions: WbAction[] = []): WorkbenchData {
  return { ...emptyWorkbench('项目目标'), actions }
}

function fakeSession(data: SessionData): Session {
  return {
    id: 's',
    title: '项目',
    mode: 'workbench',
    status: 'active',
    deletedAt: null,
    stateVersion: 0,
    versionNo: 0,
    currentStep: 'wb_act',
    createdAt: '',
    updatedAt: '',
    data
  }
}

const context = { problemSignature: 'p', revisionId: 'r' }
const progress = { id: 'p1', text: '已完成一半', createdAt: '2026-10-24' }

describe('workbench action selection commands', () => {
  it('enqueues exactly the selected candidates and preserves every planning field', () => {
    const c1 = makeAction('c1', {
      quadrant: 'do',
      dueDate: '2026-10-25',
      _context: { ...context }
    })
    const c2 = makeAction('c2', { horizon: '30d', standards: ['集中兵力', '试点推进'] })
    const c3 = makeAction('c3', { quadrant: 'plan' })
    const alreadyQueued = makeAction('q1', { planningState: 'queued', dueDate: '2026-11-01' })
    const untouched = makeAction('c4')
    const wb = makeWorkbench([c1, c2, c3, alreadyQueued, untouched])
    const before = structuredClone(wb)

    const next = applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: ['c1', 'c2', 'c3'] }])

    expect(next.actions.map((a) => a.id)).toEqual(['c1', 'c2', 'c3', 'q1', 'c4'])
    expect(next.actions.slice(0, 3).map((a) => a.planningState)).toEqual([
      'queued',
      'queued',
      'queued'
    ])
    expect(next.actions.slice(0, 3)).toEqual(
      before.actions.slice(0, 3).map((a) => ({ ...a, planningState: 'queued' }))
    )
    expect(next.actions.slice(3)).toEqual(before.actions.slice(3))
    expect(wb).toEqual(before)

    // Re-enqueueing everything is a no-op; the pure reducer keeps the same object.
    expect(
      applyWorkbenchCommands(next, [{ kind: 'enqueueActions', ids: ['c1', 'c2', 'c3'] }])
    ).toEqual(next)
    expect(enqueueCandidates(next, ['c1'])).toBe(next)
  })

  it('deduplicates ids and treats already queued actions as no-ops without resetting them', () => {
    const candidate = makeAction('c1')
    const queued = makeAction('q1', {
      planningState: 'queued',
      horizon: '30d',
      dueDate: '2026-11-01',
      progress: [progress]
    })
    const wb = makeWorkbench([candidate, queued])

    const next = applyWorkbenchCommands(wb, [
      { kind: 'enqueueActions', ids: ['c1', 'c1', 'q1', 'q1'] }
    ])

    expect(next.actions).toHaveLength(2)
    expect(next.actions[0]).toMatchObject({ id: 'c1', planningState: 'queued' })
    expect(next.actions[1]).toEqual(queued)
    expect(applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: ['q1', 'q1'] }])).toEqual(wb)
  })

  it('rejects empty, oversized, blank and missing selections without touching the workbench', () => {
    const wb = makeWorkbench([makeAction('c1')])
    const before = structuredClone(wb)
    const expectFailure = (run: () => unknown, message: string) => {
      expect(run).toThrow(message)
      expect(wb).toEqual(before)
    }

    expectFailure(
      () => applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: [] }]),
      '请先选择要整理的策略'
    )
    expectFailure(
      () =>
        enqueueCandidates(
          wb,
          Array.from({ length: 201 }, (_, i) => `a${i}`)
        ),
      '一次最多处理 200 条行动'
    )
    expectFailure(
      () => applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: ['  '] }]),
      '行动标识无效'
    )
    expectFailure(
      () => applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: ['c1', 'missing'] }]),
      '有行动已被删除，请刷新后重新选择'
    )
  })

  it('aborts the whole batch when one id is missing', () => {
    const wb = makeWorkbench([makeAction('c1'), makeAction('c2')])
    const before = structuredClone(wb)

    expect(() =>
      applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: ['c1', 'gone'] }])
    ).toThrow('有行动已被删除，请刷新后重新选择')

    expect(wb).toEqual(before)
    expect(wb.actions[0].planningState).toBe('candidate')
  })

  it('refuses to enqueue candidates that already carry an execution status', () => {
    for (const status of ['done', 'dropped'] as const) {
      const wb = makeWorkbench([makeAction('bad', { status })])
      expect(() => applyWorkbenchCommands(wb, [{ kind: 'enqueueActions', ids: ['bad'] }])).toThrow(
        '「动作 bad」已经开始执行过，不能作为候选加入'
      )
    }
  })

  it('returns queued actions to candidates safely and allows re-enqueueing', () => {
    const queued = makeAction('q1', {
      planningState: 'queued',
      quadrant: 'plan',
      dueDate: '2026-11-01',
      horizon: '90d',
      _context: { ...context }
    })
    const candidate = makeAction('c2')
    const wb = makeWorkbench([queued, candidate])

    const next = applyWorkbenchCommands(wb, [{ kind: 'returnActionsToCandidates', ids: ['q1'] }])
    expect(next.actions[0]).toEqual({ ...queued, planningState: 'candidate' })
    expect(next.actions[1]).toEqual(candidate)
    expect(returnActionsToCandidates(next, ['c2'])).toBe(next)

    const reenqueued = applyWorkbenchCommands(next, [{ kind: 'enqueueActions', ids: ['q1'] }])
    expect(reenqueued.actions[0]).toEqual(queued)

    const done = makeAction('done', { planningState: 'queued', status: 'done' })
    const dropped = makeAction('dropped', { planningState: 'queued', status: 'dropped' })
    const progressed = makeAction('prog', { planningState: 'queued', progress: [progress] })
    expect(() =>
      applyWorkbenchCommands(makeWorkbench([done]), [
        { kind: 'returnActionsToCandidates', ids: ['done'] }
      ])
    ).toThrow('「动作 done」已完成，不能移回候选')
    expect(() =>
      applyWorkbenchCommands(makeWorkbench([dropped]), [
        { kind: 'returnActionsToCandidates', ids: ['dropped'] }
      ])
    ).toThrow('「动作 dropped」已放弃，不能移回候选')
    expect(() =>
      applyWorkbenchCommands(makeWorkbench([progressed]), [
        { kind: 'returnActionsToCandidates', ids: ['prog'] }
      ])
    ).toThrow('「动作 prog」已有阶段记录，不能移回候选')

    // One invalid action rejects the whole batch, including otherwise valid ids.
    const mixed = makeWorkbench([makeAction('ok', { planningState: 'queued' }), done])
    const before = structuredClone(mixed)
    expect(() =>
      applyWorkbenchCommands(mixed, [{ kind: 'returnActionsToCandidates', ids: ['ok', 'done'] }])
    ).toThrow('已完成，不能移回候选')
    expect(mixed).toEqual(before)
  })

  it('creates a queued todo action with trimmed text, optional planning fields and strict input', () => {
    const wb = makeWorkbench([makeAction('c1')])
    const value = {
      id: 'n1',
      horizon: '30d' as const,
      action: '  联系客户  ',
      purpose: ' 调研 ',
      verify: ' 3 次访谈 ',
      standards: ['实事求是'],
      kpi: ' 2 家 ',
      quadrant: 'plan' as const,
      dueDate: '2026-11-11'
    }

    const next = applyWorkbenchCommands(wb, [{ kind: 'createQueuedAction', value }])
    const created = next.actions.at(-1)!
    expect(created).toMatchObject({
      id: 'n1',
      horizon: '30d',
      action: '联系客户',
      purpose: '调研',
      verify: '3 次访谈',
      standards: ['实事求是'],
      kpi: '2 家',
      quadrant: 'plan',
      dueDate: '2026-11-11',
      planningState: 'queued',
      status: 'todo',
      progress: []
    })
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false)

    const minimal = applyWorkbenchCommands(wb, [
      {
        kind: 'createQueuedAction',
        value: {
          id: 'n2',
          horizon: '7d',
          action: '  补一条动作 ',
          purpose: '',
          verify: '',
          standards: [],
          kpi: ''
        }
      }
    ])
    const minimalAction = minimal.actions.at(-1)!
    expect(minimalAction).toMatchObject({
      id: 'n2',
      action: '补一条动作',
      planningState: 'queued',
      status: 'todo',
      progress: []
    })
    expect(minimalAction).not.toHaveProperty('quadrant')
    expect(minimalAction).not.toHaveProperty('dueDate')

    expect(() =>
      applyWorkbenchCommands(next, [{ kind: 'createQueuedAction', value: { ...value, id: 'n1' } }])
    ).toThrow('行动标识已存在，请刷新后重试')
    expect(() =>
      applyWorkbenchCommands(wb, [
        { kind: 'createQueuedAction', value: { ...value, id: 'n3', action: '   ' } }
      ])
    ).toThrow('请填写要做的动作')

    const extras: Record<string, unknown> = {
      status: 'todo',
      progress: [],
      _context: context,
      planningState: 'queued'
    }
    for (const [key, extra] of Object.entries(extras))
      expect(() =>
        applyWorkbenchCommands(wb, [
          { kind: 'createQueuedAction', value: { ...value, id: 'n4', [key]: extra } as any }
        ])
      ).toThrow('格式')
  })

  it('blocks the plain action command from bypassing planning state or execution guards', () => {
    const candidate = makeAction('c1')
    const queued = makeAction('q1', { planningState: 'queued' })
    const wb = makeWorkbench([candidate, queued])

    expect(() =>
      applyWorkbenchCommands(wb, [
        { kind: 'action', value: makeAction('new', { planningState: 'queued' }) }
      ])
    ).toThrow('新建策略只能是候选；要加入待办请使用“加入待办”')
    expect(() =>
      applyWorkbenchCommands(wb, [{ kind: 'action', value: makeAction('new', { status: 'done' }) }])
    ).toThrow('候选策略不能带执行状态或阶段记录')
    expect(() =>
      applyWorkbenchCommands(wb, [
        { kind: 'action', value: makeAction('new', { progress: [progress] }) }
      ])
    ).toThrow('候选策略不能带执行状态或阶段记录')

    expect(() =>
      applyWorkbenchCommands(wb, [
        { kind: 'action', value: { ...candidate, planningState: 'queued' } }
      ])
    ).toThrow('纳入状态只能通过加入待办或移回候选修改')
    expect(() =>
      applyWorkbenchCommands(wb, [
        { kind: 'action', value: { ...queued, planningState: 'candidate' } }
      ])
    ).toThrow('纳入状态只能通过加入待办或移回候选修改')

    expect(() =>
      applyWorkbenchCommands(wb, [{ kind: 'action', value: { ...candidate, status: 'done' } }])
    ).toThrow('候选策略不能完成或放弃，请先加入待办')
    expect(() =>
      applyWorkbenchCommands(wb, [{ kind: 'action', value: { ...candidate, status: 'dropped' } }])
    ).toThrow('候选策略不能完成或放弃，请先加入待办')
    expect(() =>
      applyWorkbenchCommands(wb, [
        { kind: 'action', value: { ...candidate, progress: [progress] } }
      ])
    ).toThrow('候选策略不能写入执行进展，请先加入待办')

    const done = applyWorkbenchCommands(wb, [
      { kind: 'action', value: { ...queued, status: 'done', progress: [progress] } }
    ])
    expect(done.actions[1]).toMatchObject({
      planningState: 'queued',
      status: 'done',
      progress: [progress]
    })

    const added = applyWorkbenchCommands(wb, [{ kind: 'action', value: makeAction('new') }])
    expect(added.actions.at(-1)).toMatchObject({
      id: 'new',
      planningState: 'candidate',
      status: 'todo',
      progress: []
    })
  })

  it('turns candidate field edits into plain action commands but refuses planning-state diffs', () => {
    const before = makeWorkbench([makeAction('c1'), makeAction('q1', { planningState: 'queued' })])

    const edited = structuredClone(before)
    edited.actions[0].purpose = '新的目的'
    expect(workbenchCommands(before, edited)).toEqual([
      { kind: 'action', value: edited.actions[0] }
    ])

    const toQueued = structuredClone(before)
    toQueued.actions[0].planningState = 'queued'
    expect(() => workbenchCommands(before, toQueued)).toThrow(
      '纳入状态只能通过加入待办或移回候选修改'
    )

    const toCandidate = structuredClone(before)
    toCandidate.actions[1].planningState = 'candidate'
    expect(() => workbenchCommands(before, toCandidate)).toThrow(
      '纳入状态只能通过加入待办或移回候选修改'
    )
  })

  it('rejects candidate actions with execution state through the session validator', () => {
    const session = fakeSession({
      ...emptySessionData(),
      workbench: makeWorkbench([makeAction('c1')])
    })

    const done = {
      ...emptySessionData(),
      workbench: makeWorkbench([makeAction('c1', { status: 'done' })])
    }
    expect(() => validateWorkbenchSession(session, done, true)).toThrow(
      '候选策略不能带执行状态或阶段记录'
    )

    const progressed = {
      ...emptySessionData(),
      workbench: makeWorkbench([makeAction('c1', { progress: [progress] })])
    }
    expect(() => validateWorkbenchSession(session, progressed, true)).toThrow(
      '候选策略不能带执行状态或阶段记录'
    )

    const queued = {
      ...emptySessionData(),
      workbench: makeWorkbench([
        makeAction('c1', { planningState: 'queued', status: 'done', progress: [progress] })
      ])
    }
    expect(() => validateWorkbenchSession(session, queued, true)).not.toThrow()
  })
})
