import { describe, expect, it } from 'vitest'
import { createThinkingAI } from '../src/shared/engine/workbench-thinking'
import { emptyWorkbench, type Settings } from '../src/shared/types'
import {
  thinkingInput,
  thinkingSituation,
  THINKING_DIMENSIONS
} from '../src/shared/workbench-thinking'
import { workbenchCommands } from '../src/shared/contracts/workbench'
import { applyWorkbenchCommands } from '../src/shared/engine/workbench-reducer'
import { workbenchInput } from '../src/shared/engine/workbench-input'
import { decodeSessionData } from '../src/shared/engine/session-data'
import { buildWbChatSystem } from '../src/shared/engine/workbench-prompts'
import { thinkingResultSchema } from '../src/shared/contracts/state-schema'

const settings = { apiKey: 'test' } as Settings
const action = {
  action: '本周访谈3位目标用户',
  purpose: '验证是否有真实需求',
  verify: '记录3份现用方案与痛点'
}
const aspect = { name: '现有交付方式', strength: '已有习惯', weakness: '反馈慢' }
function output(method: 'contradiction' | 'objSubj' = 'contradiction') {
  return {
    status: 'ready',
    summary: '先验证交付方式是否匹配真实需求。',
    information: THINKING_DIMENSIONS[method].map((d) => ({
      key: d.key,
      state: 'sufficient',
      evidence: '用户提供的现状',
      judgment: '已有依据',
      missing: ''
    })),
    questions: [],
    contradiction:
      method === 'contradiction'
        ? {
            all: ['交付速度 vs 需求变化', '新用户增长 vs 维护投入'],
            primary: '交付速度 vs 需求变化',
            why: '先打通反馈会减少反复返工',
            mainAspect: aspect,
            secondaryAspect: aspect,
            turningConditions: ['一周内完成反馈闭环'],
            leverage: '先验证一个场景'
          }
        : null,
    objSubj:
      method === 'objSubj'
        ? {
            objective: '需求有证据',
            subjective: '交付需要补齐',
            quadrant: 'build',
            conclusion: '谨慎可行',
            gap: '交付验证'
          }
        : null,
    notNow: ['暂不全面推广，先验证一个场景'],
    actions: [{ ...action }]
  }
}
async function analyze(raw: unknown, method: 'contradiction' | 'objSubj' = 'contradiction') {
  const wb = emptyWorkbench()
  wb.form.situation =
    '我负责一个项目，每周都有客户反馈，但交付总要两个月，目前只有两个人，希望本月缩短反馈周期。'
  wb.form.thinkingMethod = method
  let id = 0
  const think = createThinkingAI({
    callJson: async <T>() => structuredClone(raw) as T,
    randomUUID: () => `action-${++id}`
  })
  return { wb, result: await think(settings, wb) }
}

describe('原始两框架与简化工作台', () => {
  it('一段话即可分析，建议始终是未来7天的候选，模型不能设置执行状态', async () => {
    const raw = output()
    Object.assign(raw.actions[0], {
      id: 'unsafe',
      status: 'done',
      planningState: 'queued',
      horizon: '90d'
    })
    const { wb, result } = await analyze(raw)
    expect(wb.intake).toBeNull()
    expect(result.actions[0]).toMatchObject({
      id: 'action-1',
      status: 'todo',
      planningState: 'candidate',
      horizon: '7d',
      progress: []
    })
    expect(result.method).toBe('contradiction')
    expect(result.objSubj).toBeNull()
    expect(() => thinkingResultSchema(result, 'thinking')).not.toThrow()
  })

  it('矛盾分析3到4维充分时降为暂定，少于3维拒绝直接判主矛盾', async () => {
    const raw = output()
    raw.information[0].state = 'partial'
    expect((await analyze(raw)).result.status).toBe('tentative')
    raw.information[1].state = raw.information[2].state = 'missing'
    await expect(analyze(raw)).rejects.toThrow('信息不足')
    Object.assign(raw, {
      status: 'needs_info',
      contradiction: null,
      questions: [{ question: '谁需要这个结果？', why: '判断需求是否真实' }]
    })
    expect((await analyze(raw)).result).toMatchObject({ status: 'needs_info', contradiction: null })
  })

  it('主客分析必须覆盖三看两建，空白维度不能用其他条件补偿', async () => {
    const raw = output('objSubj')
    const { result } = await analyze(raw, 'objSubj')
    expect(result.information.map((i) => i.key)).toEqual([
      'structure',
      'demand',
      'trend',
      'ability',
      'organization'
    ])
    expect(result.objSubj?.quadrant).toBe('build')
    raw.information.splice(1, 1)
    await expect(analyze(raw, 'objSubj')).rejects.toThrow('信息不足')
    raw.objSubj!.quadrant = 'unknown'
    raw.questions = [{ question: '有谁明确表示需要？', why: '需求空白，不能判断可行' }] as never
    const blocked = (await analyze(raw, 'objSubj')).result
    expect(blocked.status).toBe('needs_info')
    expect(blocked.information.find((i) => i.key === 'demand')?.state).toBe('missing')
  })

  it('缺行动验证或需要补信息却不追问的响应不会被保存', async () => {
    const raw = output()
    raw.actions[0].verify = ''
    await expect(analyze(raw)).rejects.toThrow('近期建议')
    Object.assign(raw, { contradiction: null, status: 'needs_info', actions: [{ ...action }] })
    await expect(analyze(raw)).rejects.toThrow('关键追问')
  })

  it('结果和行动一次保存、重新读取，只有显式加入才成为待办', async () => {
    const { wb, result } = await analyze(output())
    const before = structuredClone(wb)
    before.diagnosis.routes = { legacy: true } as never
    // 原有路线结果保存在历史结构里；生成输入不会读入它。
    expect(thinkingInput(before)).not.toHaveProperty('routes')
    const next = { ...wb, thinking: result, actions: result.actions }
    const saved = applyWorkbenchCommands(wb, workbenchCommands(wb, next))
    const decoded = decodeSessionData({
      schemaVersion: 3,
      problem: { text: '', background: '', tried: '' },
      diagnosis: null,
      readings: [],
      actions: [],
      reviews: [],
      mindset: null,
      workbench: saved
    })
    expect(decoded.workbench?.thinking).toEqual(result)
    expect(decoded.workbench?.actions[0].planningState).toBe('candidate')
    const queued = applyWorkbenchCommands(saved, [
      { kind: 'enqueueActions', ids: [result.actions[0].id] }
    ])
    expect(queued.actions[0].planningState).toBe('queued')
    expect(saved.actions[0].planningState).toBe('candidate')
  })

  it('旧输入自动带回且不要求补齐表单；清空后保持为空', () => {
    const wb = emptyWorkbench('试点推广')
    wb.form.knownFacts = '目前两个人，预算一万元'
    wb.form.blockers = ['反馈慢', '', '']
    expect(thinkingSituation(wb)).toContain('目前两个人')
    expect(thinkingSituation(wb)).toContain('卡点：反馈慢')
    wb.form.situation = ''
    expect(thinkingSituation(wb)).toBe('')
  })

  it('生成签名覆盖输入和已承诺行动；候选保存不令结果立即过时', async () => {
    const { wb, result } = await analyze(output())
    const input = workbenchInput({ workbench: wb } as never, 'wb_think')
    expect(
      workbenchInput(
        { workbench: { ...wb, thinking: result, actions: result.actions } } as never,
        'wb_think'
      )
    ).toEqual(input)
    wb.form.situation += '新的限制'
    expect(workbenchInput({ workbench: wb } as never, 'wb_think')).not.toEqual(input)
    const chat = buildWbChatSystem({ ...wb, thinking: result })
    expect(chat).toContain('输入已变化')
    expect(chat).toContain('看结构、需求、趋势')
  })
})
