import { randomUUID } from 'node:crypto'
import type {
  ChatMessage,
  Settings,
  WbAction,
  WbCheck,
  WbConfidence,
  WbContradiction,
  WbDecision,
  WbEnhancement,
  WbFact,
  WbFactKind,
  WbHorizon,
  WbIntake,
  WbLedgerEntry,
  WbModuleMeta,
  WbObjSubj,
  WbQuestion,
  WbRecapInput,
  WbRecapResult,
  WbRoute,
  WbRouteKey,
  WbRoutes,
  WbScore,
  WorkbenchData
} from '@shared/types'
import {
  WB_ENHANCEMENTS,
  WB_ROUTES,
  WB_STANDARD_NAMES,
  blockingChecks,
  mergeWaived,
  nextFactNo,
  ruleChecksActions,
  ruleChecksDecision
} from '@shared/workbench'
import { callJson as rawCallJson, type LlmMessage } from '../model-runtime/public'

const callJson = rawCallJson
import {
  WB_ACTIONS_SYSTEM,
  WB_CONTRADICTION_SYSTEM,
  WB_DECIDE_SYSTEM,
  WB_INTAKE_SYSTEM,
  WB_OBJSUBJ_SYSTEM,
  WB_RECAP_SYSTEM,
  WB_REDTEAM_SYSTEM,
  WB_ROUTES_SYSTEM,
  buildWbActionsUser,
  buildWbChatSystem,
  buildWbContradictionUser,
  buildWbDecideUser,
  buildWbIntakeUser,
  buildWbObjSubjUser,
  buildWbRecapUser,
  buildWbRedteamUser,
  buildWbRoutesUser
} from './prompts'

const NO_API_KEY = '请先在设置中填写 DeepSeek API Key'
const FACT_LIMIT = 40
const CHECK_AREAS = ['facts', 'contradiction', 'routes', 'objSubj', 'decision', 'actions'] as const
type CheckArea = WbCheck['area']
type CheckScope = 'decision' | 'actions'

function ensureKey(s: Settings): void {
  if (!s || typeof s.apiKey !== 'string' || !s.apiKey.trim()) throw new Error(NO_API_KEY)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = asString(item)
    if (!text || out.includes(text)) continue
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function clip(value: unknown, max: number): string {
  return asString(value).slice(0, max)
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeKind(value: unknown): WbFactKind {
  const text = asString(value)
  return text === 'fact' || text === 'judgment' || text === 'wish' ? text : 'fact'
}

function normalizeConfidence(value: unknown): WbConfidence {
  const text = asString(value)
  return text === 'confirmed' || text === 'assumed' || text === 'uncertain' ? text : 'uncertain'
}

function requireIntake(wb: WorkbenchData): WbIntake {
  if (!wb.intake) throw new Error('先整理事实台账')
  return wb.intake
}

/** 三个诊断模块共用的元字段：事实引用必须在台账里且是事实。 */
function baseMeta(raw: unknown, wb: WorkbenchData): WbModuleMeta {
  const src = asRecord(raw)
  const factIds = new Set(
    (wb.intake?.facts ?? []).filter((f) => f.kind === 'fact').map((f) => f.id)
  )
  const factRefs: string[] = []
  const rawRefs = Array.isArray(src.factRefs) ? src.factRefs : []
  for (const item of rawRefs) {
    const id = asString(item)
    if (!id || !factIds.has(id) || factRefs.includes(id)) continue
    factRefs.push(id)
  }
  return {
    factRefs,
    missingFacts: asStringArray(src.missingFacts, 5),
    generatedAt: nowIso(),
    edited: false
  }
}

/* ------------------------------ 第一步：摸清事实 ------------------------------ */

export async function wbIntake(s: Settings, wb: WorkbenchData): Promise<WbIntake> {
  ensureKey(s)
  const raw = asRecord(await callJson<unknown>(s, WB_INTAKE_SYSTEM, buildWbIntakeUser(wb)))

  const oldFacts = wb.intake?.facts ?? []
  const oldById = new Map(oldFacts.map((f) => [f.id, f]))
  const oldIds = oldFacts.map((f) => f.id)
  const used = new Set<string>()
  const seenContents = new Set<string>()
  const facts: WbFact[] = []

  const rawFacts = Array.isArray(raw.facts) ? raw.facts : []
  for (const item of rawFacts) {
    if (facts.length >= FACT_LIMIT) break
    const src = asRecord(item)
    const content = clip(src.content, 120)
    if (!content || seenContents.has(content)) continue
    seenContents.add(content)
    const rawId = asString(src.id)
    const id =
      rawId && oldById.has(rawId) && !used.has(rawId)
        ? rawId
        : `F${nextFactNo([...used, ...oldIds])}`
    used.add(id)
    facts.push({
      id,
      kind: normalizeKind(src.kind),
      content,
      confidence: normalizeConfidence(src.confidence)
    })
  }

  // 用户已经确认过的事实一条都不能丢
  for (const old of oldFacts) {
    if (facts.length >= FACT_LIMIT) break
    if (used.has(old.id)) continue
    used.add(old.id)
    facts.push({ ...old })
  }

  const questions: WbQuestion[] = (wb.intake?.questions ?? [])
    .filter((q) => asString(q.answer) !== '')
    .map((q) => ({ ...q }))
  const asked = new Set(questions.map((q) => q.question))
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : []
  let added = 0
  for (const item of rawQuestions) {
    if (added >= 5) break
    const src = asRecord(item)
    const question = clip(src.question, 200)
    if (!question || asked.has(question)) continue
    asked.add(question)
    questions.push({ id: randomUUID(), question, why: clip(src.why, 200), answer: '' })
    added++
  }

  return {
    facts,
    missing: asStringArray(raw.missing, 5),
    questions,
    mainline: asString(raw.mainline) || wb.form.objective,
    sideGoals: asStringArray(raw.sideGoals, 4),
    generatedAt: nowIso()
  }
}

/* ------------------------------ 第二步：三路诊断 ------------------------------ */

export async function wbContradiction(s: Settings, wb: WorkbenchData): Promise<WbContradiction> {
  ensureKey(s)
  requireIntake(wb)
  const raw = asRecord(
    await callJson<unknown>(s, WB_CONTRADICTION_SYSTEM, buildWbContradictionUser(wb))
  )
  return {
    ...baseMeta(raw, wb),
    all: asStringArray(raw.all, 6),
    primary: asString(raw.primary),
    mainAspect: asString(raw.mainAspect),
    secondaryAspect: asString(raw.secondaryAspect),
    why: asString(raw.why),
    turningConditions: asStringArray(raw.turningConditions, 3),
    focus: asString(raw.focus),
    defer: asStringArray(raw.defer, 4)
  }
}

export async function wbRoutes(s: Settings, wb: WorkbenchData): Promise<WbRoutes> {
  ensureKey(s)
  requireIntake(wb)
  const raw = asRecord(await callJson<unknown>(s, WB_ROUTES_SYSTEM, buildWbRoutesUser(wb)))
  const rawRoutes = Array.isArray(raw.routes) ? raw.routes : []

  const routes: WbRoute[] = WB_ROUTES.map((meta, index) => {
    const matched = rawRoutes.find((item) => asString(asRecord(item).key) === meta.key)
    const src = asRecord(matched ?? rawRoutes[index])
    return {
      key: meta.key,
      judgment: asString(src.judgment),
      policy: asString(src.policy),
      result: asString(src.result),
      triggers: asStringArray(src.triggers, 3),
      risks: asStringArray(src.risks, 3),
      switchSignals: asStringArray(src.switchSignals, 3)
    }
  })

  return { ...baseMeta(raw, wb), routes }
}

function toScore(value: unknown): WbScore {
  const src = asRecord(value)
  const n = Number(src.score)
  const clamped = Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 1
  return { score: clamped, reason: asString(src.reason) }
}

export async function wbObjSubj(s: Settings, wb: WorkbenchData): Promise<WbObjSubj> {
  ensureKey(s)
  requireIntake(wb)
  const raw = asRecord(await callJson<unknown>(s, WB_OBJSUBJ_SYSTEM, buildWbObjSubjUser(wb)))
  return {
    ...baseMeta(raw, wb),
    trend: toScore(raw.trend),
    resources: toScore(raw.resources),
    constraints: toScore(raw.constraints),
    judgment: toScore(raw.judgment),
    execution: toScore(raw.execution),
    ready: asString(raw.ready),
    biggestGap: asString(raw.biggestGap),
    firstFix: asString(raw.firstFix),
    ifNotFixed: asString(raw.ifNotFixed)
  }
}

/* ------------------------------ 第三步：综合决策 ------------------------------ */

export async function wbDecide(s: Settings, wb: WorkbenchData): Promise<WbDecision> {
  ensureKey(s)
  const d = wb.diagnosis
  if (!d.contradiction || !d.routes || !d.objSubj) throw new Error('三路诊断都完成后才能综合')

  const failing = blockingChecks(wb.decision?.checks ?? [])
  const raw = asRecord(await callJson<unknown>(s, WB_DECIDE_SYSTEM, buildWbDecideUser(wb, failing)))

  const routeText = asString(raw.route)
  const route: WbRouteKey =
    routeText === 'steady' || routeText === 'breakthrough' || routeText === 'defensive'
      ? routeText
      : 'steady'

  const enhancements: WbEnhancement[] = []
  const enhancementKeys = new Set<string>()
  const rawEnhancements = Array.isArray(raw.enhancements) ? raw.enhancements : []
  for (const item of rawEnhancements) {
    if (enhancements.length >= 2) break
    const src = asRecord(item)
    const key = asString(src.key)
    const point = asString(src.point)
    if (!key || !point) continue
    if (!WB_ENHANCEMENTS.some((e) => e.key === key)) continue
    if (enhancementKeys.has(key)) continue
    enhancementKeys.add(key)
    enhancements.push({ key, point })
  }

  const decision: WbDecision = {
    primaryContradiction: asString(raw.primaryContradiction),
    route,
    routeReason: asString(raw.routeReason),
    biggestGap: asString(raw.biggestGap),
    firstBattle: asString(raw.firstBattle),
    notNow: asStringArray(raw.notNow, 5),
    toInvestigate: asStringArray(raw.toInvestigate, 4),
    conflictsFixed: asStringArray(raw.conflictsFixed, 6),
    enhancements,
    checks: [],
    confirmed: false,
    generatedAt: nowIso(),
    edited: false
  }

  const checks = await runChecks(s, { ...wb, decision }, 'decision')
  return { ...decision, checks: mergeWaived(wb.decision?.checks ?? [], checks) }
}

export async function wbRecheck(s: Settings, wb: WorkbenchData): Promise<WbCheck[]> {
  ensureKey(s)
  if (!wb.decision) throw new Error('还没有综合决策')
  const checks = await runChecks(s, wb, 'decision')
  return mergeWaived(wb.decision.checks, checks)
}

/* ------------------------------ 第四步：行动与复盘 ------------------------------ */

export async function wbActions(
  s: Settings,
  wb: WorkbenchData
): Promise<{ actions: WbAction[]; checks: WbCheck[] }> {
  ensureKey(s)
  if (!wb.decision?.confirmed) throw new Error('先确认综合决策')

  const raw = asRecord(await callJson<unknown>(s, WB_ACTIONS_SYSTEM, buildWbActionsUser(wb)))
  const rawActions = Array.isArray(raw.actions) ? raw.actions : []
  const createdAt = nowIso()
  const actions: WbAction[] = []

  for (const item of rawActions) {
    if (actions.length >= 10) break
    const src = asRecord(item)
    const action = asString(src.action)
    if (!action) continue
    const horizonText = asString(src.horizon)
    const horizon: WbHorizon =
      horizonText === '7d' || horizonText === '30d' || horizonText === '90d' ? horizonText : '7d'
    const standards: string[] = []
    for (const name of asStringArray(src.standards, 6)) {
      if (!(WB_STANDARD_NAMES as readonly string[]).includes(name)) continue
      if (standards.includes(name)) continue
      standards.push(name)
      if (standards.length >= 3) break
    }
    actions.push({
      id: randomUUID(),
      horizon,
      action,
      purpose: asString(src.purpose),
      verify: asString(src.verify),
      standards,
      kpi: asString(src.kpi),
      status: 'todo',
      progress: [],
      createdAt
    })
  }

  const checks = await runChecks(s, { ...wb, actions: [...wb.actions, ...actions] }, 'actions')
  return { actions, checks: mergeWaived(wb.actionChecks, checks) }
}

export async function wbRecap(
  s: Settings,
  wb: WorkbenchData,
  input: WbRecapInput
): Promise<WbRecapResult> {
  ensureKey(s)
  const progress = (input.progress ?? '').trim()
  const factChanges = (input.factChanges ?? '').trim()
  const judgmentsToFix = (input.judgmentsToFix ?? '').trim()
  if (!progress && !factChanges && !judgmentsToFix) throw new Error('先写一写最新进展')

  const raw = asRecord(await callJson<unknown>(s, WB_RECAP_SYSTEM, buildWbRecapUser(wb, input)))

  const rawLines: string[] = []
  if (progress) rawLines.push(`最新进展：${progress}`)
  if (factChanges) rawLines.push(`客观事实变化：${factChanges}`)
  if (judgmentsToFix) rawLines.push(`要修正的旧判断：${judgmentsToFix}`)

  const entry: WbLedgerEntry = {
    id: randomUUID(),
    createdAt: nowIso(),
    inputType: judgmentsToFix ? 'revision' : 'update',
    rawInput: rawLines.join('\n'),
    factDelta: asStringArray(raw.factDelta, 6),
    judgmentDelta: asStringArray(raw.judgmentDelta, 6),
    actionsDelta: asStringArray(raw.actionsDelta, 6),
    oldAssumptionsToFix: asStringArray(raw.oldAssumptionsToFix, 6),
    summary: clip(raw.summary, 80) || progress.slice(0, 60)
  }

  const newFacts: WbFact[] = []
  const newContents = new Set<string>()
  let counter = nextFactNo((wb.intake?.facts ?? []).map((f) => f.id))
  const rawNewFacts = Array.isArray(raw.newFacts) ? raw.newFacts : []
  for (const item of rawNewFacts) {
    if (newFacts.length >= 6) break
    const src = asRecord(item)
    const content = clip(src.content, 120)
    if (!content || newContents.has(content)) continue
    newContents.add(content)
    newFacts.push({
      id: `F${counter}`,
      kind: normalizeKind(src.kind),
      content,
      confidence: normalizeConfidence(src.confidence)
    })
    counter++
  }

  return {
    entry,
    newFacts,
    rediagnose: raw.rediagnose === true,
    rediagnoseReason: asString(raw.rediagnoseReason)
  }
}

/* ------------------------------ 检查：硬规则 + 红队 ------------------------------ */

async function runChecks(s: Settings, wb: WorkbenchData, scope: CheckScope): Promise<WbCheck[]> {
  const rules = scope === 'decision' ? ruleChecksDecision(wb) : ruleChecksActions(wb.actions)
  const fallbackArea: CheckArea = scope === 'actions' ? 'actions' : 'decision'
  const ai: WbCheck[] = []

  try {
    const raw = asRecord(
      await callJson<unknown>(s, WB_REDTEAM_SYSTEM, buildWbRedteamUser(wb, scope))
    )
    const failItems = Array.isArray(raw.failItems) ? raw.failItems : []
    for (let i = 0; i < failItems.length; i++) {
      if (ai.length >= 6) break
      const src = asRecord(failItems[i])
      const message = asString(src.message)
      if (!message) continue
      const areaText = asString(src.area)
      const area = (CHECK_AREAS as readonly string[]).includes(areaText)
        ? (areaText as CheckArea)
        : fallbackArea
      ai.push({ id: `ai:${scope}:${i}`, source: 'ai', area, passed: false, message, waived: false })
    }
    if (!ai.length) {
      ai.push({
        id: `ai:${scope}:ok`,
        source: 'ai',
        area: fallbackArea,
        passed: true,
        message: '红队审核：未发现问题',
        waived: false
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ai.push({
      id: `ai:${scope}:error`,
      source: 'ai',
      area: fallbackArea,
      passed: true,
      message: `红队审核没有完成（${message}），只跑了硬规则`,
      waived: false
    })
  }

  return [...rules, ...ai]
}

/* ------------------------------ 右侧对话 ------------------------------ */

export function buildWbChatMessages(
  wb: WorkbenchData,
  history: ChatMessage[],
  userContent: string
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: 'system', content: buildWbChatSystem(wb) }]

  for (const m of history.slice(-20)) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    if (!m.content || !m.content.trim()) continue
    messages.push({ role: m.role, content: m.content })
  }

  messages.push({ role: 'user', content: userContent })
  return messages
}
