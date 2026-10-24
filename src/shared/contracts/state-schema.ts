import type { SessionData, WorkbenchData } from '../types'
import {
  array,
  bool,
  integer,
  nullable as n,
  object as o,
  oneOf,
  optional as opt,
  text as s
} from './validation'
const strings = array(s)
export const problemSchema = o({ text: s, background: s, tried: s })
export const notesSchema = o({ coreMethod: s, relatedProblem: s, action: s })
export const sourceSchema = o({ bookId: s, revisionId: s, chapterId: s, paragraphId: s })
export const contextSchema = o({
  conversationSignature: opt(s),
  problemSignature: s,
  revisionId: s,
  requestId: opt(s),
  sessionId: opt(s),
  profileVersion: opt(s),
  purpose: opt(s),
  inputSignature: opt(s),
  articleId: opt(s)
})
const ai = { _context: opt(contextSchema) }
const analysis = opt(o({ obstacle: s, constraints: s }))
export const diagnosisSchema = o({
  ...ai,
  restated: s,
  symptoms: strings,
  mainContradiction: s,
  stage: s,
  analysis,
  recommendations: array(
    o({
      articleId: s,
      title: s,
      reason: s,
      focusQuestion: s,
      evidence: opt(o({ paragraphIndex: integer, quote: s, source: sourceSchema }))
    })
  )
})
export const passageSchema = o({
  ...ai,
  source: opt(sourceSchema),
  paragraphIndex: integer,
  quote: s,
  why: s,
  verified: bool
})
export const feedbackSchema = o({
  ...ai,
  passed: bool,
  scores: o({ coreMethod: integer, relatedProblem: integer, action: integer }),
  comments: strings,
  rereadParagraphs: array(integer)
})
export const reflectionSchema = o({
  source: opt(sourceSchema),
  id: s,
  paragraphIndex: n(integer),
  quote: s,
  text: s,
  createdAt: s
})
export const progressSchema = o({ id: s, text: s, createdAt: s })
export const readingSchema = o({
  articleId: s,
  title: s,
  startedAt: s,
  focusQuestion: s,
  passages: array(passageSchema),
  reflections: array(reflectionSchema),
  readDone: bool,
  notes: notesSchema,
  feedback: n(feedbackSchema),
  notesDone: bool
})
export const actionPlanningSchema = {
  quadrant: opt(n(oneOf('do', 'plan', 'delegate', 'reduce'))),
  purpose: opt(s),
  verify: opt(s)
}
export const actionSchema = o({
  ...actionPlanningSchema,
  id: s,
  text: s,
  fromArticleId: n(s),
  dueDate: s,
  status: oneOf('todo', 'done', 'dropped'),
  result: s,
  progress: array(progressSchema),
  createdAt: s
})
export const reviewSchema = o({
  ...ai,
  id: s,
  createdAt: s,
  newSituation: s,
  rereadArticleIds: strings,
  advice: s
})
export const mindsetSchema = o({
  ...ai,
  mainContradiction: s,
  stage: s,
  analysis,
  firstStep: s,
  generatedAt: s
})
const fact = o({
  id: s,
  kind: oneOf('fact', 'judgment', 'wish'),
  content: s,
  confidence: oneOf('confirmed', 'assumed', 'uncertain')
})
export const intakeSchema = o({
  ...ai,
  facts: array(fact),
  missing: strings,
  questions: array(o({ id: s, question: s, why: s, answer: s })),
  mainline: s,
  sideGoals: strings,
  generatedAt: s
})
const meta = { ...ai, factRefs: strings, missingFacts: strings, generatedAt: s, edited: bool }
const score = o({ score: integer, reason: s })
export const contradictionSchema = o({
  ...meta,
  all: strings,
  primary: s,
  mainAspect: s,
  secondaryAspect: s,
  why: s,
  turningConditions: strings,
  focus: s,
  defer: strings
})
export const routesSchema = o({
  ...meta,
  routes: array(
    o({
      key: oneOf('steady', 'breakthrough', 'defensive'),
      judgment: s,
      policy: s,
      result: s,
      triggers: strings,
      risks: strings,
      switchSignals: strings
    })
  )
})
export const objSubjSchema = o({
  ...meta,
  trend: score,
  resources: score,
  constraints: score,
  judgment: score,
  execution: score,
  ready: s,
  biggestGap: s,
  firstFix: s,
  ifNotFixed: s
})
export const checkSchema = o({
  ...ai,
  id: s,
  source: oneOf('rule', 'ai'),
  area: oneOf('facts', 'contradiction', 'routes', 'objSubj', 'decision', 'actions'),
  passed: bool,
  message: s,
  waived: bool
})
export const decisionSchema = o({
  ...ai,
  primaryContradiction: s,
  route: oneOf('steady', 'breakthrough', 'defensive'),
  routeReason: s,
  biggestGap: s,
  firstBattle: s,
  notNow: strings,
  toInvestigate: strings,
  conflictsFixed: strings,
  enhancements: array(o({ key: s, point: s })),
  checks: array(checkSchema),
  confirmed: bool,
  generatedAt: s,
  edited: bool
})
export const wbActionSchema = o({
  ...actionPlanningSchema,
  dueDate: opt(s),
  ...ai,
  id: s,
  horizon: oneOf('7d', '30d', '90d'),
  action: s,
  purpose: s,
  verify: s,
  standards: strings,
  kpi: s,
  planningState: oneOf('candidate', 'queued'),
  status: oneOf('todo', 'done', 'dropped'),
  progress: array(progressSchema),
  createdAt: s
})
/** 工作清单里手工新增并关联工作台时允许用户提交的字段；不含来源、执行进展和生命周期状态。 */
export const queuedActionInputSchema = o({
  id: s,
  horizon: oneOf('7d', '30d', '90d'),
  action: s,
  purpose: s,
  verify: s,
  standards: strings,
  kpi: s,
  quadrant: opt(n(oneOf('do', 'plan', 'delegate', 'reduce'))),
  dueDate: opt(s)
})
export const ledgerSchema = o({
  ...ai,
  id: s,
  createdAt: s,
  inputType: oneOf('new', 'update', 'revision', 'feedback'),
  rawInput: s,
  factDelta: strings,
  judgmentDelta: strings,
  actionsDelta: strings,
  oldAssumptionsToFix: strings,
  summary: s
})
export const formSchema = o({
  projectName: s,
  objective: s,
  timeScale: oneOf('', '7天', '30天', '90天', '1年', '5年'),
  stage: oneOf('', '起步', '相持', '攻坚', '扩张', '调整'),
  blockers: strings,
  background: s,
  knownFacts: s,
  opponents: s,
  allies: s,
  swing: s
})
export const workbenchSchema = o({
  form: formSchema,
  intake: n(intakeSchema),
  diagnosis: o({
    contradiction: n(contradictionSchema),
    routes: n(routesSchema),
    objSubj: n(objSubjSchema)
  }),
  decision: n(decisionSchema),
  actions: array(wbActionSchema),
  actionChecks: array(checkSchema),
  ledger: array(ledgerSchema)
})
export const sessionDataSchema = o({
  schemaVersion: opt(integer),
  book: opt(
    o({
      bookId: s,
      revisionId: s,
      title: s,
      profile: oneOf('maoxuan', 'generic'),
      profileVersion: s
    })
  ),
  problem: problemSchema,
  diagnosis: n(diagnosisSchema),
  readings: array(readingSchema),
  actions: array(actionSchema),
  reviews: array(reviewSchema),
  mindset: n(mindsetSchema),
  workbench: opt(workbenchSchema)
})
export function assertSessionData(value: unknown): asserts value is SessionData {
  sessionDataSchema(value, 'session')
}
export function assertWorkbench(value: unknown): asserts value is WorkbenchData {
  workbenchSchema(value, 'workbench')
}
