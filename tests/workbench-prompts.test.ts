import { describe, expect, it } from 'vitest'
import { emptyWorkbench, type WbAction, type WorkbenchData } from '@shared/types'
import { buildWbRedteamUser } from '../src/main/modules/workbench/prompts'

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
  return { ...emptyWorkbench('把工作台改到可验收'), actions }
}

const TITLES = [
  '【候选策略 · 尚未承诺执行，仅供参考】',
  '【当前待办 · 已承诺执行且未完成，多线作战只看这里】',
  '【已完成记录 · 已经做完，不计入当前执行负担】',
  '【已放弃记录 · 用户明确不再做，不计入执行负担】'
] as const

/** 取某个分区从标题到下一个分区标题之间的内容，用于断言条目落在正确的分区。 */
function sectionOf(prompt: string, title: string): string {
  const start = prompt.indexOf(title)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = TITLES.map((t) => prompt.indexOf(t, start + title.length)).filter((i) => i >= 0)
  const end = rest.length ? Math.min(...rest) : prompt.length
  return prompt.slice(start, end)
}

describe('buildWbRedteamUser action audit input', () => {
  it('serializes queued todo and done actions differently, keeping done out of current todos', () => {
    const wb = makeWorkbench([makeAction('a1')])
    const todoPrompt = buildWbRedteamUser(wb, 'actions')
    const donePrompt = buildWbRedteamUser(
      { ...wb, actions: [{ ...wb.actions[0], status: 'done' }] },
      'actions'
    )

    expect(donePrompt).not.toBe(todoPrompt)
    expect(sectionOf(todoPrompt, TITLES[1])).toContain('- [7d｜待办]')
    expect(sectionOf(todoPrompt, TITLES[1])).toContain('动作 a1')
    expect(sectionOf(donePrompt, TITLES[1])).not.toContain('动作 a1')
    expect(sectionOf(donePrompt, TITLES[1])).toContain('（无）')
    expect(sectionOf(donePrompt, TITLES[2])).toContain('- [7d｜已完成]')
    expect(sectionOf(donePrompt, TITLES[2])).toContain('动作 a1')
  })

  it('serializes dropped actions into their own partition instead of hiding the state change', () => {
    const wb = makeWorkbench([makeAction('a1')])
    const droppedPrompt = buildWbRedteamUser(
      { ...wb, actions: [{ ...wb.actions[0], status: 'dropped' }] },
      'actions'
    )

    expect(droppedPrompt).not.toBe(buildWbRedteamUser(wb, 'actions'))
    expect(sectionOf(droppedPrompt, TITLES[1])).not.toContain('动作 a1')
    expect(sectionOf(droppedPrompt, TITLES[2])).not.toContain('动作 a1')
    expect(sectionOf(droppedPrompt, TITLES[3])).toContain('- [7d｜已放弃]')
    expect(sectionOf(droppedPrompt, TITLES[3])).toContain('动作 a1')
  })

  it('labels candidates as reference only and keeps them out of the execution commitment', () => {
    const wb = makeWorkbench([
      makeAction('c1', { planningState: 'candidate' }),
      makeAction('q1', { planningState: 'queued' })
    ])
    const prompt = buildWbRedteamUser(wb, 'actions')

    expect(sectionOf(prompt, TITLES[0])).toContain('- [7d｜候选策略]')
    expect(sectionOf(prompt, TITLES[0])).toContain('动作 c1')
    expect(sectionOf(prompt, TITLES[1])).toContain('- [7d｜待办]')
    expect(sectionOf(prompt, TITLES[1])).toContain('动作 q1')
    expect(sectionOf(prompt, TITLES[1])).not.toContain('c1')
  })

  it('keeps the decision-scope prompt stable and independent of action status', () => {
    const wb = makeWorkbench([makeAction('a1')])
    const todoPrompt = buildWbRedteamUser(wb, 'decision')
    const donePrompt = buildWbRedteamUser(
      { ...wb, actions: [{ ...wb.actions[0], status: 'done' }] },
      'decision'
    )

    expect(todoPrompt).toBe(donePrompt)
    expect(todoPrompt).toBe(buildWbRedteamUser(wb, 'decision'))
    expect(todoPrompt).not.toContain('【待审核的行动】')
  })

  it('preserves the existing audit structure around the new action partitions', () => {
    const prompt = buildWbRedteamUser(makeWorkbench([makeAction('a1')]), 'actions')

    for (const block of ['【主要矛盾】', '【三条路线】', '【主客分析】', '【决策快照】']) {
      expect(prompt).toContain(block)
    }
    expect(prompt).toContain('【待审核的行动】')
    expect(prompt).toContain('【本次只审核】行动')
  })
})
