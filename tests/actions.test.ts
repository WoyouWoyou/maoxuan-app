import { describe, expect, it } from 'vitest'
import {
  actionCommands,
  collectActions,
  dueLabel,
  newAction,
  standaloneAction
} from '../src/shared/actions'
import { emptySessionData, emptyWorkbench, type Session, type WbAction } from '../src/shared/types'
import { applyReadingCommands } from '../src/main/modules/reading/public'
import { applyWorkbenchCommands } from '../src/main/modules/workbench/public'
import { assertSessionData } from '../src/shared/contracts/state-schema'
import { decodeSessionData } from '../src/main/modules/sessions/public'

function session(mode: Session['mode'] = 'reading'): Session {
  return {
    id: mode,
    title: '公司 AI 推广',
    mode,
    status: 'active',
    deletedAt: null,
    stateVersion: 0,
    versionNo: 0,
    bookId: 'maoxuan',
    bookTitle: '毛泽东选集',
    currentStep: mode === 'reading' ? 'problem' : 'wb_intake',
    createdAt: '',
    updatedAt: '',
    data: {
      ...emptySessionData(),
      ...(mode === 'workbench' ? { workbench: emptyWorkbench() } : {})
    }
  }
}
function add(s: Session, id = 'same-id') {
  const c = newAction(s, id, { text: '核实阻力' }, '2026-10-23T10:00:00Z')
  if (s.mode === 'reading') s.data = applyReadingCommands(s.data, c.reading)
  else s.data.workbench = applyWorkbenchCommands(s.data.workbench!, c.workbench)
  return s
}
function wbAction(id: string, overrides: Partial<Omit<WbAction, 'id'>> = {}): WbAction {
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
    createdAt: '2026-10-23T10:00:00Z',
    ...overrides
  }
}
describe('unified action center', () => {
  it('collects both sources without guessing quadrants, keeps colliding ids distinct, excludes trash', () => {
    const reading = add(session()),
      workbench = add(session('workbench'))
    workbench.status = 'archived'
    const trashed = { ...add(session()), id: 'trash', deletedAt: '2026-10-23' }
    const tasks = collectActions([reading, workbench, trashed])
    expect(tasks.map((t) => t.key)).toEqual(['reading:same-id', 'workbench:same-id'])
    expect(tasks.every((t) => t.quadrant === null)).toBe(true)
    expect(tasks[1].archived).toBe(true)
    expect(tasks[1].dueDate).toBe('')
  })
  it('persists planning, completion and progress on the original reading action without losing result', () => {
    const s = add(session())
    s.data.actions[0].result = '保留已有结果'
    const c = actionCommands(
      s,
      'same-id',
      {
        quadrant: 'plan',
        purpose: '调查事实',
        verify: '3 次访谈',
        dueDate: '2026-10-26T18:00',
        status: 'done'
      },
      { id: 'p1', text: '已约同事', createdAt: '2026-10-23' }
    )
    const next = applyReadingCommands(s.data, c.reading)
    expect(next.actions[0]).toMatchObject({
      quadrant: 'plan',
      status: 'done',
      purpose: '调查事实',
      verify: '3 次访谈',
      result: '保留已有结果',
      progress: [{ id: 'p1' }]
    })
    expect(decodeSessionData(JSON.stringify(next))).toEqual(next)
    const legacyEdit = applyReadingCommands(next, [
      {
        kind: 'editAction',
        id: 'same-id',
        value: { text: '新标题', dueDate: '', status: 'todo', result: '结果' }
      }
    ])
    expect(legacyEdit.actions[0].quadrant).toBe('plan')
  })
  it('edits workbench planning without losing horizon, verification, context or concurrent progress', () => {
    const s = add(session('workbench'))
    const current = s.data.workbench!.actions[0]
    current.horizon = '90d'
    current.kpi = '3 人'
    current.standards = ['facts']
    current.progress.push({ id: 'old', text: '其他窗口的进展', createdAt: '' })
    const c = actionCommands(
      s,
      'same-id',
      { quadrant: 'do', dueDate: '2026-10-23', status: 'done' },
      { id: 'new', text: '本次进展', createdAt: '' }
    )
    const next = applyWorkbenchCommands(s.data.workbench!, c.workbench)
    expect(next.actions[0]).toMatchObject({
      horizon: '90d',
      kpi: '3 人',
      standards: ['facts'],
      quadrant: 'do',
      status: 'done'
    })
    expect(next.actions[0].progress.map((p) => p.id)).toEqual(['old', 'new'])
    assertSessionData({ ...s.data, workbench: next })
  })
  it('supports clearing classification and rejects removed actions and invalid quadrants', () => {
    const s = add(session())
    const next = applyReadingCommands(
      s.data,
      actionCommands(s, 'same-id', { quadrant: null }).reading
    )
    expect(next.actions[0].quadrant).toBeNull()
    expect(() => actionCommands(s, 'missing', { status: 'done' })).toThrow('删除')
    expect(() => actionCommands(s, 'same-id', { text: ' ' })).toThrow('不能为空')
    expect(() =>
      applyReadingCommands(s.data, [
        {
          kind: 'editAction',
          id: 'same-id',
          value: { text: 'x', dueDate: '', status: 'todo', result: '', quadrant: 'invalid' }
        } as any
      ])
    ).toThrow('格式')
  })
  it('formats local deadlines and date-only tasks correctly, including cross-year overdue tasks', () => {
    expect(dueLabel('2026-10-23T18:00', '2026-10-23')).toBe('今天 18:00')
    expect(dueLabel('', '2026-10-23')).toBe('未安排')
    expect(dueLabel('2027-01-01', '2026-10-23')).toBe('2027年1月1日')
    expect(dueLabel('2025-10-23', '2026-10-23')).toBe('逾期 · 2025年10月23日')
  })
  it('projects only queued workbench actions and leaves reading and standalone sources unchanged', () => {
    const reading = add(session())
    const workbench = session('workbench')
    workbench.data.workbench = applyWorkbenchCommands(workbench.data.workbench!, [
      { kind: 'action', value: wbAction('candidate-1', { purpose: '候选目的' }) },
      {
        kind: 'createQueuedAction',
        value: {
          id: 'same-id',
          horizon: '30d',
          action: '动作 same-id',
          purpose: '先调查',
          verify: '3 次访谈',
          standards: ['实事求是'],
          kpi: '指标 same-id',
          quadrant: 'plan',
          dueDate: '2026-11-01'
        }
      }
    ])
    workbench.status = 'archived'
    const trashed = { ...session('workbench'), id: 'trash', deletedAt: '2026-10-24' }
    trashed.data = structuredClone(workbench.data)

    const tasks = collectActions([reading, workbench, trashed])
    expect(tasks.map((t) => t.key)).toEqual(['reading:same-id', 'workbench:same-id'])
    expect(tasks.map((t) => t.id)).toEqual(['same-id', 'same-id'])
    expect(tasks.some((t) => t.id === 'candidate-1')).toBe(false)
    expect(tasks[1]).toMatchObject({
      mode: 'workbench',
      archived: true,
      text: '动作 same-id',
      horizon: '30d',
      purpose: '先调查',
      verify: '3 次访谈',
      quadrant: 'plan',
      dueDate: '2026-11-01'
    })
    expect(tasks[0]).toMatchObject({ mode: 'reading', archived: false, text: '核实阻力' })

    const standalone = standaloneAction({
      id: 's1',
      text: '独立任务',
      fromArticleId: null,
      dueDate: '',
      status: 'todo',
      result: '',
      progress: [],
      createdAt: ''
    })
    expect(standalone).toMatchObject({
      key: ':s1',
      mode: 'default',
      sessionId: '',
      text: '独立任务'
    })
  })
  it('edits a queued workbench action without losing planning state or execution fields', () => {
    const s = add(session('workbench'))
    const current = s.data.workbench!.actions[0]
    current.horizon = '90d'
    current.kpi = '3 人'
    current.standards = ['实事求是']
    current.quadrant = 'plan'
    current.dueDate = '2026-11-01'
    current.progress.push({ id: 'old', text: '已有阶段', createdAt: '' })
    const c = actionCommands(
      s,
      'same-id',
      { purpose: '新的目的', verify: '新的验证' },
      { id: 'new', text: '本次进展', createdAt: '' }
    )
    const next = applyWorkbenchCommands(s.data.workbench!, c.workbench)
    expect(next.actions[0]).toMatchObject({
      planningState: 'queued',
      horizon: '90d',
      kpi: '3 人',
      standards: ['实事求是'],
      quadrant: 'plan',
      dueDate: '2026-11-01',
      purpose: '新的目的',
      verify: '新的验证'
    })
    expect(next.actions[0].progress.map((p) => p.id)).toEqual(['old', 'new'])
  })
  it('makes a workbench action created from the action hub immediately visible as a queued todo', () => {
    const s = add(session('workbench'), 'hub-1')
    const stored = s.data.workbench!.actions.find((a) => a.id === 'hub-1')!
    expect(stored).toMatchObject({
      planningState: 'queued',
      status: 'todo',
      progress: [],
      action: '核实阻力'
    })
    const tasks = collectActions([s])
    expect(tasks.map((t) => t.key)).toEqual(['workbench:hub-1'])
    expect(tasks[0]).toMatchObject({
      mode: 'workbench',
      status: 'todo',
      text: '核实阻力'
    })
    expect(Number.isNaN(Date.parse(tasks[0].createdAt))).toBe(false)
  })
})
