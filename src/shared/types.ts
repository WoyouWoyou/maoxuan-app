import type { BookScope, ReadingProfile, SourceRef } from './contracts/library'
export type ReadingStepKey = 'problem' | 'focus' | 'relate' | 'apply'
export type WbStepKey = 'wb_intake' | 'wb_diagnose' | 'wb_decide' | 'wb_act'
export type StepKey = ReadingStepKey | WbStepKey

/** reading = 阅读法（带着问题读原文）；workbench = 毛选工作台（带着项目做决策）。 */
export type SessionMode = 'reading' | 'workbench'

export interface StepMeta<K extends StepKey = StepKey> {
  key: K
  no: number
  name: string
  hint: string
}

export const STEPS: StepMeta<ReadingStepKey>[] = [
  { key: 'problem', no: 1, name: '明确问题', hint: '没有问题，就不要翻开《毛选》' },
  { key: 'focus', no: 2, name: '聚焦核心', hint: '先精读核心五篇，不必通读全书' },
  { key: 'relate', no: 3, name: '联系自身', hint: '每读一篇，写下 3 条“跟我有什么关系”' },
  { key: 'apply', no: 4, name: '反复应用', hint: '越用越懂，而不是越读越懂' }
]

export const WB_STEPS: StepMeta<WbStepKey>[] = [
  { key: 'wb_intake', no: 1, name: '摸清事实', hint: '先调查，后判断：分清事实、判断、愿望' },
  { key: 'wb_diagnose', no: 2, name: '三路诊断', hint: '主要矛盾 · 三条路线 · 主客分析' },
  { key: 'wb_decide', no: 3, name: '综合决策', hint: '三块结论打架，先修再走' },
  { key: 'wb_act', no: 4, name: '行动复盘', hint: '7 天 · 30 天 · 90 天，做了再改' }
]

export const MODE_META: Record<SessionMode, { name: string; short: string; desc: string }> = {
  reading: { name: '阅读法', short: '读', desc: '带着问题读原文，写下自己的 3 条，干 1 件事' },
  workbench: {
    name: '毛选工作台',
    short: '台',
    desc: '带着项目做决策：摸事实 → 主要矛盾 / 三条路线 / 主客分析 → 综合 → 7/30/90 天行动'
  }
}

export function stepMeta(key: StepKey): StepMeta | undefined {
  return (
    (STEPS as StepMeta[]).find((s) => s.key === key) ??
    (WB_STEPS as StepMeta[]).find((s) => s.key === key)
  )
}

export interface ArticleMeta {
  bookId?: string
  revisionId?: string
  id: string
  title: string
  volume: string
  isCore: boolean
  coreOrder: number | null
  length: number
}

export interface Article extends ArticleMeta {
  content: string
  paragraphs: string[]
  paragraphIds?: string[]
}

export interface SearchHit {
  id: string
  title: string
  volume: string
  snippet: string
}

export interface ProblemInput {
  text: string
  background: string
  tried: string
}

export interface AIContext {
  conversationSignature?: string
  requestId?: string
  sessionId?: string
  profileVersion?: string
  purpose?: string
  inputSignature?: string
  articleId?: string
  problemSignature: string
  revisionId: string
}

export interface ArticleRecommendation {
  evidence?: { paragraphIndex: number; quote: string; source: SourceRef }
  articleId: string
  title: string
  reason: string
  focusQuestion: string
}

export interface Diagnosis {
  analysis?: { obstacle: string; constraints: string }
  _context?: AIContext
  restated: string
  symptoms: string[]
  mainContradiction: string
  stage: string
  recommendations: ArticleRecommendation[]
}

/** 根据右侧讨论生成的第一步修订建议，由用户逐项选择是否套用。 */
export interface ProblemRevision {
  problem: ProblemInput
  diagnosis: Diagnosis
  changes: string[]
}

export interface Passage {
  _context?: AIContext
  source?: SourceRef
  paragraphIndex: number
  quote: string
  why: string
  verified: boolean
}

export interface ThreeNotes {
  coreMethod: string
  relatedProblem: string
  action: string
}

export interface NoteFeedback {
  _context?: AIContext
  passed: boolean
  scores: { coreMethod: number; relatedProblem: number; action: number }
  comments: string[]
  rereadParagraphs: number[]
}

/** 第二步阅读时随手记下的感悟，可关联某一段原文。 */
export interface Reflection {
  source?: SourceRef
  id: string
  paragraphIndex: number | null
  quote: string
  text: string
  createdAt: string
}

export interface Reading {
  articleId: string
  title: string
  startedAt: string
  focusQuestion: string
  passages: Passage[]
  reflections: Reflection[]
  readDone: boolean
  notes: ThreeNotes
  feedback: NoteFeedback | null
  notesDone: boolean
}

export type ActionStatus = 'todo' | 'done' | 'dropped'
export type ActionQuadrant = 'do' | 'plan' | 'delegate' | 'reduce'

/** Optional so historical actions remain unclassified until the user decides. */
export interface ActionPlanning {
  quadrant?: ActionQuadrant | null
  purpose?: string
  verify?: string
}

/** 行动的一次阶段完成记录；行动往往要分几段才能干完。 */
export interface ActionProgress {
  id: string
  text: string
  createdAt: string
}

export interface ActionItem extends ActionPlanning {
  id: string
  text: string
  fromArticleId: string | null
  dueDate: string
  status: ActionStatus
  result: string
  progress: ActionProgress[]
  createdAt: string
}

export interface Review {
  _context?: AIContext
  id: string
  createdAt: string
  newSituation: string
  rereadArticleIds: string[]
  advice: string
}

export interface Mindset {
  analysis?: { obstacle: string; constraints: string }
  _context?: AIContext
  mainContradiction: string
  stage: string
  firstStep: string
  generatedAt: string
}

/* ============================== 毛选工作台 ============================== */

export type WbTimeScale = '7天' | '30天' | '90天' | '1年' | '5年'
export type WbStage = '起步' | '相持' | '攻坚' | '扩张' | '调整'

/** 第一步用户填写的原始输入。 */
export interface WbForm {
  projectName: string
  /** 一个项目只围绕一个主目标 */
  objective: string
  timeScale: WbTimeScale | ''
  stage: WbStage | ''
  /** 当前最卡的 3 个问题，固定 3 格，可留空 */
  blockers: string[]
  background: string
  /** 已知的客观事实：数字、资源、约束、已做动作和结果 */
  knownFacts: string
  /** 敌：主要阻力 */
  opponents: string
  /** 友：稳定助力 */
  allies: string
  /** 可争取力量：中间地带、潜在支持者、可借资源 */
  swing: string
}

export type WbFactKind = 'fact' | 'judgment' | 'wish'
export type WbConfidence = 'confirmed' | 'assumed' | 'uncertain'

/** 事实台账条目。id 形如 F1、F2，全局递增不复用；只有 kind='fact' 的条目可以被判断引用。 */
export interface WbFact {
  id: string
  kind: WbFactKind
  content: string
  /** assumed = 暂用假设；uncertain = 来源不确定 */
  confidence: WbConfidence
}

/** 缺关键事实时的追问；用户回答后再次整理。 */
export interface WbQuestion {
  id: string
  question: string
  /** 为什么问：不补会导致什么误判 */
  why: string
  answer: string
}

export interface WbIntake {
  _context?: AIContext
  facts: WbFact[]
  missing: string[]
  questions: WbQuestion[]
  /** 目标混杂时给出的主线；只有一个目标时复述主目标 */
  mainline: string
  /** 应拆出去的支线目标 */
  sideGoals: string[]
  generatedAt: string
}

export interface WbModuleMeta {
  _context?: AIContext
  /** 引用的事实 id，已在代码里校验存在且为 kind='fact' */
  factRefs: string[]
  /** 本模块认为还缺的事实 */
  missingFacts: string[]
  generatedAt: string
  /** 用户手动改过 */
  edited: boolean
}

export interface WbContradiction extends WbModuleMeta {
  all: string[]
  primary: string
  mainAspect: string
  secondaryAspect: string
  why: string
  turningConditions: string[]
  focus: string
  defer: string[]
}

export type WbRouteKey = 'steady' | 'breakthrough' | 'defensive'

export interface WbRoute {
  key: WbRouteKey
  judgment: string
  policy: string
  result: string
  triggers: string[]
  risks: string[]
  switchSignals: string[]
}

export interface WbRoutes extends WbModuleMeta {
  /** 固定三条，顺序 steady / breakthrough / defensive */
  routes: WbRoute[]
}

export interface WbScore {
  /** 1–5 整数 */
  score: number
  reason: string
}

export interface WbObjSubj extends WbModuleMeta {
  trend: WbScore
  resources: WbScore
  constraints: WbScore
  judgment: WbScore
  execution: WbScore
  ready: string
  biggestGap: string
  firstFix: string
  ifNotFixed: string
}

export interface WbDiagnosis {
  contradiction: WbContradiction | null
  routes: WbRoutes | null
  objSubj: WbObjSubj | null
}

/** 可选增强模块：只能增强主流程，必须落到判断或行动。key 见 WB_ENHANCEMENTS。 */
export interface WbEnhancement {
  key: string
  point: string
}

export interface WbCheck {
  _context?: AIContext
  id: string
  /** rule = 代码硬规则；ai = 红队审核 */
  source: 'rule' | 'ai'
  area: 'facts' | 'contradiction' | 'routes' | 'objSubj' | 'decision' | 'actions'
  passed: boolean
  message: string
  /** 用户确认“已知晓，保留”后视为放行 */
  waived: boolean
}

export interface WbDecision {
  _context?: AIContext
  primaryContradiction: string
  route: WbRouteKey
  routeReason: string
  biggestGap: string
  firstBattle: string
  notNow: string[]
  toInvestigate: string[]
  /** 三模块之间的冲突以及怎么修的 */
  conflictsFixed: string[]
  enhancements: WbEnhancement[]
  checks: WbCheck[]
  confirmed: boolean
  generatedAt: string
  edited: boolean
}

export type WbHorizon = '7d' | '30d' | '90d'

/**
 * 纳入状态：候选 = 只是可以考虑做什么；已纳入 = 用户本轮决定要做。
 * 与执行结果 `status` 回答不同问题，不能互相推导。
 */
export type WbActionPlanningState = 'candidate' | 'queued'

export interface WbAction {
  quadrant?: ActionQuadrant | null
  dueDate?: string
  _context?: AIContext
  id: string
  horizon: WbHorizon
  action: string
  purpose: string
  verify: string
  /** 毛选执行标准，取值见 WB_STANDARDS */
  standards: string[]
  kpi: string
  /** 是否已被用户纳入工作清单；候选不进入清单，也没有执行操作。 */
  planningState: WbActionPlanningState
  status: ActionStatus
  progress: ActionProgress[]
  createdAt: string
}

export type WbLedgerType = 'new' | 'update' | 'revision' | 'feedback'

/** 项目台账：只追加，不覆盖。 */
export interface WbLedgerEntry {
  _context?: AIContext
  id: string
  createdAt: string
  inputType: WbLedgerType
  /** 用户原始输入，逐字保留 */
  rawInput: string
  factDelta: string[]
  judgmentDelta: string[]
  actionsDelta: string[]
  oldAssumptionsToFix: string[]
  summary: string
}

export interface WbRecapInput {
  progress: string
  factChanges: string
  judgmentsToFix: string
}

export interface WbRecapResult {
  entry: WbLedgerEntry
  /** 建议追加进事实台账的新事实（id 已按现有台账续号） */
  newFacts: WbFact[]
  /** 是否建议回到第二步重新诊断 */
  rediagnose: boolean
  rediagnoseReason: string
}

export interface WorkbenchData {
  form: WbForm
  intake: WbIntake | null
  diagnosis: WbDiagnosis
  decision: WbDecision | null
  actions: WbAction[]
  actionChecks: WbCheck[]
  ledger: WbLedgerEntry[]
}

export function emptyWorkbench(objective = ''): WorkbenchData {
  return {
    form: {
      projectName: '',
      objective,
      timeScale: '',
      stage: '',
      blockers: ['', '', ''],
      background: '',
      knownFacts: '',
      opponents: '',
      allies: '',
      swing: ''
    },
    intake: null,
    diagnosis: { contradiction: null, routes: null, objSubj: null },
    decision: null,
    actions: [],
    actionChecks: [],
    ledger: []
  }
}

export interface SessionData {
  schemaVersion?: number
  book?: BookScope & { title: string; profile: ReadingProfile; profileVersion: string }
  problem: ProblemInput
  diagnosis: Diagnosis | null
  readings: Reading[]
  actions: ActionItem[]
  reviews: Review[]
  mindset: Mindset | null
  /** 仅 mode='workbench' 的会话有 */
  workbench?: WorkbenchData
}

export interface SessionSummary {
  bookId?: string
  bookTitle?: string
  stateVersion: number
  id: string
  title: string
  mode: SessionMode
  currentStep: StepKey
  status: 'active' | 'archived'
  /** 移入回收站的时间；null 表示不在回收站。回收站优先于 status。 */
  deletedAt: string | null
  versionNo: number
  createdAt: string
  updatedAt: string
}

export interface Session extends SessionSummary {
  data: SessionData
}

export interface SessionMetadataPatch {
  title?: string
  currentStep?: StepKey
  status?: 'active' | 'archived'
}
export interface SessionPatch extends SessionMetadataPatch {
  mutationId?: string
  expectedStateVersion: number
}

export interface VersionSummary {
  id: string
  sessionId: string
  versionNo: number
  step: StepKey
  label: string
  createdAt: string
}

export interface Version extends VersionSummary {
  data: SessionData
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  articleId: string | null
  createdAt: string
}

export interface Settings {
  configId?: string
  hasApiKey?: boolean
  temperatureEnabled?: boolean
  streamUsage?: boolean
  apiKey: string
  baseUrl: string
  model: string
}

export interface ChatChunkEvent {
  requestId: string
  delta: string
}

export interface ChatDoneEvent {
  requestId: string
  message: ChatMessage
}

export interface ChatErrorEvent {
  requestId: string
  error: string
}

/** v3：工作台行动新增必填 `planningState`，旧行动迁移为 queued。 */
export const SESSION_DATA_VERSION = 3
export function emptySessionData(): SessionData {
  return {
    schemaVersion: SESSION_DATA_VERSION,
    problem: { text: '', background: '', tried: '' },
    diagnosis: null,
    readings: [],
    actions: [],
    reviews: [],
    mindset: null
  }
}
