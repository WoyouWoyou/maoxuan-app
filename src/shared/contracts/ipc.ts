import { actionEditSchema } from './action-planning'
import { readerPreferencesSchema, speechRequestSchema } from './reader'
import { proxySettingsSchema } from './proxy'
import {
  array,
  bool,
  integer,
  nullable as n,
  object as o,
  oneOf,
  optional as opt,
  tagged,
  text as s,
  tuple,
  type Schema
} from './validation'
import {
  actionSchema,
  actionPlanningSchema,
  checkSchema,
  contradictionSchema,
  decisionSchema,
  diagnosisSchema,
  feedbackSchema,
  formSchema,
  intakeSchema,
  ledgerSchema,
  mindsetSchema,
  notesSchema,
  objSubjSchema,
  passageSchema,
  problemSchema,
  progressSchema,
  readingSchema,
  reflectionSchema,
  reviewSchema,
  routesSchema,
  queuedActionInputSchema,
  wbActionSchema
} from './state-schema'
import { settingsSchema } from './models'
export const readingCommandSchema = tagged('kind', {
  problem: o({ kind: oneOf('problem'), value: problemSchema }),
  diagnosis: o({ kind: oneOf('diagnosis'), value: n(diagnosisSchema) }),
  startReading: o({ kind: oneOf('startReading'), value: readingSchema }),
  removeReading: o({ kind: oneOf('removeReading'), id: s }),
  readingStatus: o({
    kind: oneOf('readingStatus'),
    id: s,
    focusQuestion: s,
    readDone: bool,
    notesDone: bool
  }),
  saveNotes: o({ kind: oneOf('saveNotes'), id: s, value: notesSchema }),
  passages: o({ kind: oneOf('passages'), id: s, value: array(passageSchema) }),
  feedback: o({ kind: oneOf('feedback'), id: s, value: n(feedbackSchema) }),
  reflection: o({ kind: oneOf('reflection'), id: s, value: reflectionSchema }),
  removeReflection: o({ kind: oneOf('removeReflection'), id: s, reflectionId: s }),
  createAction: o({ kind: oneOf('createAction'), value: actionSchema }),
  editAction: o({
    kind: oneOf('editAction'),
    id: s,
    value: o({
      ...actionPlanningSchema,
      text: s,
      dueDate: s,
      status: oneOf('todo', 'done', 'dropped'),
      result: s
    })
  }),
  actionProgress: o({ kind: oneOf('actionProgress'), id: s, value: progressSchema }),
  removeActionProgress: o({ kind: oneOf('removeActionProgress'), id: s, progressId: s }),
  removeAction: o({ kind: oneOf('removeAction'), id: s }),
  review: o({ kind: oneOf('review'), value: reviewSchema }),
  mindset: o({ kind: oneOf('mindset'), value: n(mindsetSchema) })
})
export const workbenchCommandSchema = tagged('kind', {
  form: o({ kind: oneOf('form'), value: formSchema }),
  intake: o({ kind: oneOf('intake'), value: n(intakeSchema) }),
  decision: o({ kind: oneOf('decision'), value: n(decisionSchema) }),
  checks: o({ kind: oneOf('checks'), value: array(checkSchema) }),
  diagnosisModule: (value, path) => {
    o({
      kind: oneOf('diagnosisModule'),
      module: oneOf('contradiction', 'routes', 'objSubj'),
      value: () => {}
    })(value, path)
    const c = value as { module: 'contradiction' | 'routes' | 'objSubj'; value: unknown }
    n(
      { contradiction: contradictionSchema, routes: routesSchema, objSubj: objSubjSchema }[c.module]
    )(c.value, `${path}.value`)
  },
  action: o({ kind: oneOf('action'), value: wbActionSchema }),
  removeAction: o({ kind: oneOf('removeAction'), id: s }),
  enqueueActions: o({ kind: oneOf('enqueueActions'), ids: array(s, 500) }),
  returnActionsToCandidates: o({ kind: oneOf('returnActionsToCandidates'), ids: array(s, 500) }),
  createQueuedAction: o({ kind: oneOf('createQueuedAction'), value: queuedActionInputSchema }),
  appendLedger: o({ kind: oneOf('appendLedger'), value: ledgerSchema })
})
const scope = opt(o({ bookId: s, revisionId: s }, true)),
  steps = oneOf(
    'problem',
    'focus',
    'relate',
    'apply',
    'wb_intake',
    'wb_diagnose',
    'wb_decide',
    'wb_act'
  )
const channels: Record<string, Schema> = {
  'actions:list': tuple(),
  'actions:create': tuple(actionEditSchema),
  'actions:edit': tuple(s, actionEditSchema, opt(s)),
  'actions:classify': tuple(array(o({ sessionId: s, actionId: s }), 200), s),
  'settings:setReader': tuple(readerPreferencesSchema),
  'speech:synthesize': tuple(speechRequestSchema),
  'speech:prefetch': tuple(speechRequestSchema),
  'speech:cancel': tuple(s),
  'reading:apply': tuple(s, array(readingCommandSchema, 500), integer, opt(s), opt(steps), s),
  'wb:apply': tuple(s, array(workbenchCommandSchema, 500), integer, opt(s), opt(steps), s),
  'sessions:create': tuple(s, opt(oneOf('reading', 'workbench')), opt(s)),
  'sessions:update': tuple(
    s,
    o({
      mutationId: s,
      expectedStateVersion: integer,
      title: opt(s),
      currentStep: opt(steps),
      status: opt(oneOf('active', 'archived'))
    }),
    opt(s)
  ),
  'versions:restore': tuple(s, integer, s),
  'articles:list': tuple(scope),
  'articles:get': tuple(s, scope),
  'articles:search': tuple(s, opt(integer), scope),
  'library:list': tuple(opt(bool)),
  'library:hide': tuple(s, bool),
  'library:choose': tuple(opt(s)),
  'library:confirm': tuple(
    s,
    s,
    s,
    opt(o({ titles: opt(array(s)), mergeWithPrevious: opt(array(integer)) }))
  ),
  'usage:query': tuple(opt(o({ days: opt(integer), bookId: opt(s), sessionId: opt(s) }))),
  'models:setRoute': tuple(s, s),
  'models:save': tuple(opt(s), s, settingsSchema),
  'settings:set': tuple(settingsSchema),
  'settings:setProxy': tuple(proxySettingsSchema),
  'chat:send': tuple(s, s, opt(n(s))),
  'ai:findPassages': tuple(s, s),
  'ai:reviewNotes': tuple(s, s, notesSchema),
  'ai:reviewSituation': tuple(s, s),
  'wb:recap': tuple(s, o({ progress: s, factChanges: s, judgmentsToFix: s }))
}
for (const channel of [
  'sessions:list',
  'sessions:listArchived',
  'sessions:listTrash',
  'sessions:emptyTrash',
  'tasks:list',
  'models:list',
  'models:routes',
  'settings:get',
  'settings:getReader',
  'settings:getProxy',
  'settings:test'
])
  channels[channel] = tuple()
for (const channel of [
  'sessions:get',
  'sessions:remove',
  'sessions:archive',
  'sessions:unarchive',
  'sessions:trash',
  'sessions:restore',
  'versions:list',
  'versions:get',
  'library:index',
  'tasks:get',
  'tasks:cancel',
  'models:select',
  'models:cancel',
  'chat:list',
  'chat:clear',
  'ai:diagnose',
  'ai:reviseProblem',
  'ai:mindset',
  'wb:intake',
  'wb:contradiction',
  'wb:routes',
  'wb:objSubj',
  'wb:decide',
  'wb:recheck',
  'wb:actions'
])
  channels[channel] = tuple(s)
export function validateIpcArguments(channel: string, args: unknown[]): void {
  if (!Object.hasOwn(channels, channel)) throw new Error(`未定义的 IPC 通道：${channel}`)
  channels[channel](args, channel)
}
