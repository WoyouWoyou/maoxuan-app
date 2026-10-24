import { describe, expect, it } from 'vitest'
import { emptyWorkbench, type WbAction, type WorkbenchData } from '@shared/types'
import { ruleChecksExecutionLoad } from '../src/shared/workbench'

function makeAction(id: string, overrides: Partial<WbAction> = {}): WbAction {
  return {
    id,
    horizon: '7d',
    action: `动作 ${id}`,
    purpose: `目的 ${id}`,
    verify: `验证 ${id}`,
    standards: ['实事求是'],
    kpi: `指标 ${id}`,
    planningState: 'queued',
    status: 'todo',
    progress: [],
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides
  }
}

function makeWorkbench(actions: WbAction[]): WorkbenchData {
  return { ...emptyWorkbench('把 7 天待办压到 5 条以内'), actions }
}

function loadCheck(wb: WorkbenchData) {
  const check = ruleChecksExecutionLoad(wb).find((c) => c.id === 'rule:A-5')
  if (!check) throw new Error('缺少 A-5 检查项')
  return check
}

describe('ruleChecksExecutionLoad (A-5)', () => {
  it('guides returning pending todos to candidates instead of cutting the candidate pool', () => {
    const wb = makeWorkbench(Array.from({ length: 6 }, (_, i) => makeAction(`a${i + 1}`)))
    const check = loadCheck(wb)

    expect(check.passed).toBe(false)
    expect(check.message).toContain('移回候选')
    expect(check.message).toContain('5 条')
    expect(check.message).toContain('已有进展')
    expect(check.message).not.toContain('从候选里砍')
  })

  it('passes and reports concentrated force when active 7-day todos are within the limit', () => {
    const wb = makeWorkbench([
      ...Array.from({ length: 5 }, (_, i) => makeAction(`q${i + 1}`)),
      makeAction('done', { status: 'done' }),
      makeAction('candidate', { planningState: 'candidate' }),
      makeAction('long', { horizon: '30d' })
    ])
    const check = loadCheck(wb)

    expect(check.passed).toBe(true)
    expect(check.message).toContain('5 条')
    expect(check.message).toContain('兵力集中')
    expect(check.message).not.toContain('移回候选')
  })
})
