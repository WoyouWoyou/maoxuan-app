import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyWorkbench,
  type Settings,
  type WbContradiction,
  type WbDecision
} from '../src/shared/types'
import { validateIpcArguments } from '../src/shared/contracts/ipc'
import { buildWbDecideUser } from '../src/main/modules/workbench/prompts'

vi.mock('../src/main/modules/model-runtime/public', () => ({ callJson: vi.fn() }))
import { callJson } from '../src/main/modules/model-runtime/public'
import { wbDecide } from '../src/main/modules/workbench/generation'

function fixture() {
  const wb = emptyWorkbench('推广 AI')
  wb.form.diagnosisMethods = ['contradiction']
  wb.diagnosis.contradiction = {
    primary: '安装成本高',
    focus: '解决适配',
    factRefs: [],
    missingFacts: [],
    all: ['安装成本高'],
    mainAspect: '适配',
    secondaryAspect: '动机',
    why: '',
    turningConditions: [],
    defer: [],
    generatedAt: '',
    edited: false
  } as WbContradiction
  wb.decision = {
    route: 'steady',
    primaryContradiction: '安装成本高',
    routeReason: '先试点',
    biggestGap: '适配',
    firstBattle: '小范围安装验证',
    notNow: ['全面铺开'],
    toInvestigate: [],
    conflictsFixed: [],
    enhancements: [],
    checks: [],
    confirmed: true,
    edited: false,
    generatedAt: ''
  } as WbDecision
  return wb
}

describe('决策换线推演', () => {
  beforeEach(() => vi.mocked(callJson).mockReset())

  it('兼容原有生成调用，校验指定路线和主要矛盾', () => {
    expect(() => validateIpcArguments('wb:decide', ['session'])).not.toThrow()
    expect(() => validateIpcArguments('wb:decide', ['session', undefined])).not.toThrow()
    expect(() =>
      validateIpcArguments('wb:decide', [
        'session',
        { route: 'defensive', primaryContradiction: '安装成本高' }
      ])
    ).not.toThrow()
    expect(() =>
      validateIpcArguments('wb:decide', ['session', { route: 'invalid', primaryContradiction: '' }])
    ).toThrow()
  })

  it('每条路线传入独立的推演约束，携带草稿中的主要矛盾', () => {
    const wb = fixture()
    const prompts = (['steady', 'breakthrough', 'defensive'] as const).map((route) =>
      buildWbDecideUser(wb, [], { route, primaryContradiction: '用户手改的主要矛盾' })
    )
    expect(new Set(prompts).size).toBe(3)
    for (const prompt of prompts) {
      expect(prompt).toContain('保持主要矛盾原文：用户手改的主要矛盾')
      expect(prompt).toContain('不能只换路线名称或照抄原策略')
      expect(prompt).toContain('小范围安装验证')
    }
  })

  it('返回新策略供审阅，保留主要矛盾且不修改已保存决策', async () => {
    const wb = fixture()
    wb.decision!.checks = [
      {
        id: 'ai-0',
        source: 'ai',
        area: 'decision',
        passed: false,
        waived: true,
        message: '资源不足'
      }
    ]
    const before = structuredClone(wb)
    vi.mocked(callJson)
      .mockResolvedValueOnce({
        ...wb.decision,
        route: 'breakthrough',
        primaryContradiction: '模型擅改',
        routeReason: '集中技术支持',
        firstBattle: '集中攻克适配'
      })
      .mockResolvedValueOnce({ failItems: [{ area: 'decision', message: '资源不足' }] })
    const result = await wbDecide({ apiKey: 'test' } as Settings, wb, {
      route: 'breakthrough',
      primaryContradiction: '用户手改的主要矛盾'
    })
    expect(result.route).toBe('breakthrough')
    expect(result.primaryContradiction).toBe('用户手改的主要矛盾')
    expect(result.firstBattle).toBe('集中攻克适配')
    expect(result.confirmed).toBe(false)
    expect(result.checks.find((c) => c.source === 'ai')?.waived).toBe(false)
    expect(wb).toEqual(before)
  })

  it('模型擅自换回原路线时拒绝结果，原决策保持不变', async () => {
    const wb = fixture()
    const before = structuredClone(wb)
    vi.mocked(callJson).mockResolvedValueOnce({ ...wb.decision })
    await expect(
      wbDecide({ apiKey: 'test' } as Settings, wb, {
        route: 'defensive',
        primaryContradiction: '安装成本高'
      })
    ).rejects.toThrow('未采用所选路线')
    expect(wb).toEqual(before)
  })
})
