import type { AIContext, WbAction, WorkbenchData } from './types'

export type ThinkingMethod = 'contradiction' | 'objSubj'
export type InformationState = 'sufficient' | 'partial' | 'missing'
export interface ThinkingInformation {
  key: string
  state: InformationState
  evidence: string
  judgment: string
  missing: string
}
export interface ThinkingResult {
  _context?: AIContext
  method: ThinkingMethod
  situation: string
  status: 'ready' | 'tentative' | 'needs_info'
  summary: string
  information: ThinkingInformation[]
  questions: { question: string; why: string }[]
  contradiction: {
    all: string[]
    primary: string
    why: string
    mainAspect: { name: string; strength: string; weakness: string }
    secondaryAspect: { name: string; strength: string; weakness: string }
    turningConditions: string[]
    leverage: string
  } | null
  objSubj: {
    objective: string
    subjective: string
    quadrant: 'act' | 'build' | 'redirect' | 'stop' | 'unknown'
    conclusion: string
    gap: string
  } | null
  notNow: string[]
  actions: WbAction[]
  generatedAt: string
}

export const THINKING_METHODS = [
  {
    key: 'contradiction',
    name: '抓主要矛盾',
    hint: '事情很乱，先抓哪个问题？',
    source: '《矛盾论》'
  },
  {
    key: 'objSubj',
    name: '主客分析法',
    hint: '这件事能不能成，先补什么？',
    source: '《中国的红色政权为什么能够存在？》'
  }
] as const

export const THINKING_DIMENSIONS = {
  contradiction: [
    { key: 'actor', name: '主体与背景' },
    { key: 'tension', name: '冲突双方' },
    { key: 'stage', name: '时间与阶段' },
    { key: 'constraints', name: '资源与约束' },
    { key: 'goal', name: '想达到的结果' }
  ],
  objSubj: [
    { key: 'structure', name: '看结构 · 有没有裂缝' },
    { key: 'demand', name: '看需求 · 有没有人需要' },
    { key: 'trend', name: '看趋势 · 顺势还是逆势' },
    { key: 'ability', name: '建能力 · 能不能打' },
    { key: 'organization', name: '建组织 · 能不能持续' }
  ]
} as const

export const THINKING_QUADRANTS = {
  act: '客观好 × 主观强：全力出击',
  build: '客观好 × 主观弱：先练内功，边干边建',
  redirect: '客观差 × 主观强：保存实力，换个方向',
  stop: '客观差 × 主观弱：止损或等待',
  unknown: '证据不足，暂不落入象限'
} as const

/** 旧项目的已有输入直接带回；新入口只需一段话。 */
export function thinkingSituation(wb: WorkbenchData): string {
  if (wb.form.situation !== undefined) return wb.form.situation
  const f = wb.form
  return [
    f.objective,
    f.background,
    f.knownFacts,
    ...f.blockers.filter(Boolean).map((s) => `卡点：${s}`),
    f.stage && `阶段：${f.stage}`,
    f.timeScale && `时间：${f.timeScale}`,
    f.opponents && `阻力：${f.opponents}`,
    f.allies && `助力：${f.allies}`,
    f.swing && `可争取的支持：${f.swing}`,
    ...(wb.intake?.facts ?? []).map(
      (f) =>
        `${{ fact: '已知事实', judgment: '此前判断', wish: '期望' }[f.kind]}（${{ confirmed: '用户已明确提供', assumed: '假设待核实', uncertain: '不确定' }[f.confidence]}）：${f.content}`
    ),
    ...(wb.intake?.questions ?? [])
      .filter((q) => q.answer.trim())
      .map((q) => `${q.question}\n${q.answer}`)
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function thinkingMethod(wb: WorkbenchData): ThinkingMethod {
  return (
    wb.form.thinkingMethod ??
    (wb.form.diagnosisMethods?.[0] === 'objSubj' ? 'objSubj' : 'contradiction')
  )
}

export function thinkingInput(wb: WorkbenchData) {
  return {
    situation: thinkingSituation(wb),
    method: thinkingMethod(wb),
    commitments: wb.actions
      .filter((a) => a.planningState === 'queued')
      .map((a) => ({
        action: a.action,
        status: a.status,
        verify: a.verify
      }))
  }
}
