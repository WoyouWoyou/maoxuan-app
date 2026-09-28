export type StepKey = 'problem' | 'focus' | 'relate' | 'apply'

export const STEPS: { key: StepKey; no: number; name: string; hint: string }[] = [
  { key: 'problem', no: 1, name: '明确问题', hint: '没有问题，就不要翻开《毛选》' },
  { key: 'focus', no: 2, name: '聚焦核心', hint: '先精读核心五篇，不必通读全书' },
  { key: 'relate', no: 3, name: '联系自身', hint: '每读一篇，写下 3 条“跟我有什么关系”' },
  { key: 'apply', no: 4, name: '反复应用', hint: '越用越懂，而不是越读越懂' }
]

export interface ArticleMeta {
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

export interface ArticleRecommendation {
  articleId: string
  title: string
  reason: string
  focusQuestion: string
}

export interface Diagnosis {
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
  passed: boolean
  scores: { coreMethod: number; relatedProblem: number; action: number }
  comments: string[]
  rereadParagraphs: number[]
}

/** 第二步阅读时随手记下的感悟，可关联某一段原文。 */
export interface Reflection {
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

/** 行动的一次阶段完成记录；行动往往要分几段才能干完。 */
export interface ActionProgress {
  id: string
  text: string
  createdAt: string
}

export interface ActionItem {
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
  id: string
  createdAt: string
  newSituation: string
  rereadArticleIds: string[]
  advice: string
}

export interface Mindset {
  mainContradiction: string
  stage: string
  firstStep: string
  generatedAt: string
}

export interface SessionData {
  problem: ProblemInput
  diagnosis: Diagnosis | null
  readings: Reading[]
  actions: ActionItem[]
  reviews: Review[]
  mindset: Mindset | null
}

export interface SessionSummary {
  id: string
  title: string
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

export interface SessionPatch {
  title?: string
  currentStep?: StepKey
  status?: 'active' | 'archived'
  data?: SessionData
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

export function emptySessionData(): SessionData {
  return {
    problem: { text: '', background: '', tried: '' },
    diagnosis: null,
    readings: [],
    actions: [],
    reviews: [],
    mindset: null
  }
}
