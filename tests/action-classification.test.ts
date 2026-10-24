import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySessionData, emptyWorkbench, type Session } from '../src/shared/types'
import { newAction } from '../src/shared/actions'
import { applyReadingCommands } from '../src/main/modules/reading/commands'
import { applyWorkbenchCommands } from '../src/main/modules/workbench/commands'
const mocks = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  model: vi.fn(),
  reading: vi.fn(),
  workbench: vi.fn()
}))
vi.mock('../src/main/modules/sessions/public', () => ({
  getSession: (id: string) => structuredClone(mocks.sessions.get(id))
}))
vi.mock('../src/main/modules/settings/public', () => ({
  getSettings: () => ({ apiKey: 'test-key', model: 'test' })
}))
vi.mock('../src/main/modules/model-runtime/public', () => ({
  callJson: (...args: unknown[]) => mocks.model(...args),
  withModelContext: (_: unknown, work: () => unknown) => work()
}))
vi.mock('../src/main/modules/reading/public', () => ({
  applyCommands: (...args: unknown[]) => mocks.reading(...args)
}))
vi.mock('../src/main/modules/workbench/public', () => ({
  applyWorkbench: (...args: unknown[]) => mocks.workbench(...args)
}))
import {
  classifyActions,
  configureActions,
  createAction,
  editAction,
  listActions
} from '../src/main/modules/action-planning/public'
function seed(mode: 'reading' | 'workbench'): Session {
  const s = {
    id: mode,
    mode,
    title: 'AI 推广',
    deletedAt: null,
    stateVersion: 1,
    data: emptySessionData()
  } as Session
  if (mode === 'workbench') s.data.workbench = emptyWorkbench()
  const command = newAction(
    s,
    'a1',
    { text: '核实 3 位同事的实际阻力', purpose: '先调查，再决定', dueDate: '2026-10-23' },
    '2026-10-22'
  )
  if (mode === 'reading') s.data = applyReadingCommands(s.data, command.reading)
  else s.data.workbench = applyWorkbenchCommands(s.data.workbench!, command.workbench)
  mocks.sessions.set(mode, s)
  return s
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.sessions.clear()
  mocks.model.mockImplementation(async (_settings, _system, user) => ({
    assignments: JSON.parse(user).actions.map((a: { id: string }) => ({
      id: a.id,
      quadrant: 'plan'
    }))
  }))
  mocks.reading.mockImplementation((id, commands, version) => {
    const s = mocks.sessions.get(id)!
    expect(s.stateVersion).toBe(version)
    s.data = applyReadingCommands(s.data, commands)
    s.stateVersion++
    return s
  })
  mocks.workbench.mockImplementation((id, commands, version) => {
    const s = mocks.sessions.get(id)!
    expect(s.stateVersion).toBe(version)
    s.data.workbench = applyWorkbenchCommands(s.data.workbench!, commands)
    s.stateVersion++
    return s
  })
})
describe('AI action classification', () => {
  it('classifies default tasks and preserves manual edits made during inference', async () => {
    const items = new Map<string, import('../src/shared/types').ActionItem>()
    configureActions({
      list: () => [...items.values()].map((a) => structuredClone(a)),
      get: (id) => structuredClone(items.get(id)),
      save: (action) => {
        items.set(action.id, structuredClone(action))
      }
    })
    const task = createAction({ text: '提交本职工作报告' })
    const refs = [{ sessionId: '', actionId: task.id }]
    expect(await classifyActions(refs, '2026-10-24')).toMatchObject({ classified: 1, failed: 0 })
    expect(listActions()[0].quadrant).toBe('plan')
    expect(JSON.parse(mocks.model.mock.calls[0][2]).source).toEqual({ title: '默认' })
    editAction(task.id, { quadrant: null })
    mocks.model.mockImplementationOnce(async () => {
      editAction(task.id, { quadrant: 'do' }, '已开始处理')
      return { assignments: [{ id: task.id, quadrant: 'reduce' }] }
    })
    expect(await classifyActions(refs, '2026-10-24')).toMatchObject({ classified: 0, skipped: 1 })
    expect(listActions()[0]).toMatchObject({ quadrant: 'do', progress: [{ text: '已开始处理' }] })
    expect(mocks.reading).not.toHaveBeenCalled()
    expect(mocks.workbench).not.toHaveBeenCalled()
  })
  it('classifies both sources through existing commands and includes problem, date and purpose in the prompt', async () => {
    seed('reading')
    seed('workbench')
    const result = await classifyActions(
      [
        { sessionId: 'reading', actionId: 'a1' },
        { sessionId: 'workbench', actionId: 'a1' }
      ],
      '2026-10-23'
    )
    expect(result).toEqual({ classified: 2, skipped: 0, failed: 0, errors: [] })
    expect(mocks.sessions.get('reading')!.data.actions[0].quadrant).toBe('plan')
    expect(mocks.sessions.get('workbench')!.data.workbench!.actions[0].quadrant).toBe('plan')
    const prompt = JSON.parse(mocks.model.mock.calls[0][2])
    expect(prompt).toMatchObject({
      today: '2026-10-23',
      source: { title: 'AI 推广' },
      actions: [{ purpose: '先调查，再决定', dueDate: '2026-10-23' }]
    })
  })
  it('never reclassifies an assigned or completed action and deduplicates references', async () => {
    const s = seed('reading')
    s.data.actions[0].quadrant = 'do'
    const refs = [
      { sessionId: s.id, actionId: 'a1' },
      { sessionId: s.id, actionId: 'a1' }
    ]
    expect(await classifyActions(refs, '2026-10-23')).toMatchObject({ classified: 0, skipped: 1 })
    expect(mocks.model).not.toHaveBeenCalled()
    s.data.actions[0].quadrant = null
    s.data.actions[0].status = 'done'
    expect(await classifyActions(refs, '2026-10-23')).toMatchObject({ classified: 0, skipped: 1 })
  })
  it('rejects unknown ids, invalid quadrants and incomplete responses without writing', async () => {
    seed('reading')
    for (const response of [
      { assignments: [{ id: 'other', quadrant: 'do' }] },
      { assignments: [{ id: 'a1', quadrant: 'wrong' }] },
      { assignments: [] }
    ]) {
      mocks.model.mockResolvedValueOnce(response)
      expect(
        await classifyActions([{ sessionId: 'reading', actionId: 'a1' }], '2026-10-23')
      ).toMatchObject({ classified: 0, failed: 1 })
    }
    expect(mocks.reading).not.toHaveBeenCalled()
  })
  it('skips manual classification or changed input while AI is running', async () => {
    const s = seed('reading')
    mocks.model.mockImplementationOnce(async () => {
      s.data.actions[0].quadrant = 'do'
      return { assignments: [{ id: 'a1', quadrant: 'reduce' }] }
    })
    expect(
      await classifyActions([{ sessionId: 'reading', actionId: 'a1' }], '2026-10-23')
    ).toMatchObject({ classified: 0, skipped: 1 })
    expect(s.data.actions[0].quadrant).toBe('do')
    s.data.actions[0].quadrant = null
    mocks.model.mockImplementationOnce(async () => {
      s.data.actions[0].text = '任务已改'
      return { assignments: [{ id: 'a1', quadrant: 'reduce' }] }
    })
    expect(
      await classifyActions([{ sessionId: 'reading', actionId: 'a1' }], '2026-10-23')
    ).toMatchObject({ classified: 0, skipped: 1 })
    expect(mocks.reading).not.toHaveBeenCalled()
  })
  it('preserves unrelated progress added during inference and reports model failures', async () => {
    const s = seed('reading')
    mocks.model.mockImplementationOnce(async () => {
      s.data.actions[0].progress.push({ id: 'p', text: '新进展', createdAt: '' })
      s.stateVersion++
      return { assignments: [{ id: 'a1', quadrant: 'do' }] }
    })
    expect(
      await classifyActions([{ sessionId: 'reading', actionId: 'a1' }], '2026-10-23')
    ).toMatchObject({ classified: 1 })
    expect(s.data.actions[0].progress).toHaveLength(1)
    s.data.actions[0].quadrant = null
    mocks.model.mockRejectedValueOnce(new Error('模型暂不可用'))
    expect(
      await classifyActions([{ sessionId: 'reading', actionId: 'a1' }], '2026-10-23')
    ).toMatchObject({ failed: 1, errors: ['模型暂不可用'] })
  })
  it('skips candidate workbench actions without calling the model', async () => {
    const s = seed('workbench')
    s.data.workbench = applyWorkbenchCommands(s.data.workbench!, [
      { kind: 'returnActionsToCandidates', ids: ['a1'] }
    ])
    s.stateVersion++
    expect(s.data.workbench!.actions[0].planningState).toBe('candidate')

    expect(
      await classifyActions([{ sessionId: 'workbench', actionId: 'a1' }], '2026-10-23')
    ).toMatchObject({ classified: 0, skipped: 1, failed: 0 })
    expect(mocks.model).not.toHaveBeenCalled()
    expect(mocks.workbench).not.toHaveBeenCalled()
  })
  it('drops a late classification when the action is returned to candidates during inference', async () => {
    const s = seed('workbench')
    mocks.model.mockImplementationOnce(async () => {
      s.data.workbench = applyWorkbenchCommands(s.data.workbench!, [
        { kind: 'returnActionsToCandidates', ids: ['a1'] }
      ])
      s.stateVersion++
      return { assignments: [{ id: 'a1', quadrant: 'do' }] }
    })

    expect(
      await classifyActions([{ sessionId: 'workbench', actionId: 'a1' }], '2026-10-23')
    ).toMatchObject({ classified: 0, skipped: 1, failed: 0 })
    expect(mocks.workbench).not.toHaveBeenCalled()
    expect(s.data.workbench!.actions[0]).toMatchObject({ planningState: 'candidate' })
    expect(s.data.workbench!.actions[0].quadrant).toBeUndefined()
  })
})
