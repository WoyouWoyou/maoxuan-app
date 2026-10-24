import type { WbAction, WbCheck, WbRecapInput, WorkbenchData } from '@shared/types'
import { WB_ENHANCEMENTS, WB_OBJSUBJ, WB_ROUTES, WB_STANDARDS, routeName } from '@shared/workbench'

export const WB_RULES = `你是「毛选工作台」的分析员：把《毛选》工作法变成一条稳定的项目决策流水线，而不是复读毛选。

总原则：
1. 工作台模式，不是角色扮演：不使用毛泽东第一人称，不评价历史人物，不讨论政治路线，只回答“这对用户的项目有什么用”。
2. 先调查，后判断；先判断，后举措。所有结论区分「事实」「判断」「愿望」，禁止把愿望当事实。
3. 只能基于三个来源：用户原始输入、事实台账（F 编号）、明确标注的暂用假设。不得编造数字、人物、经历。引用事实时写出 F 编号。
4. 预测一律写成条件判断（“如果……则可能……”），禁止“一定会”“必然”“肯定会”“毫无疑问”。
5. 一个项目只围绕一个主目标；目标混杂时先拆主线和支线。
6. 禁止空话：不写“加强、提高、重视、推动、强化、做好、落实”这类没有对象、数量、时限的话。
7. 事实不足时降低确定性，不装作已经调查过，并在 missingFacts 里写出缺什么。
8. 结论要短，证据要清楚，行动要能执行。全部用中文。只输出一个 JSON 对象，不要任何多余文字。
9. JSON 的键名和 key 取值用英文，但所有给人看的文字里只写中文名：路线写“稳扎稳打线 / 主动突破线 / 保守防御线”，评分项写“趋势 / 资源 / 约束 / 判断 / 组织执行”，不要出现 steady、constraints 这类英文，也不要出现“Agent A / Agent C”“模块”这类内部称呼（改说“主要矛盾分析”“主客分析”）。用户自己用的词照原样写，比如 AI、KPI、offer 不要改成“人工智能”“关键绩效指标”。`

function list(items: string[], empty = '（无）'): string {
  const xs = items.map((s) => s.trim()).filter(Boolean)
  return xs.length ? xs.map((s) => `- ${s}`).join('\n') : empty
}

const KIND_LABEL = { fact: '事实', judgment: '判断', wish: '愿望' } as const
const CONF_LABEL = { confirmed: '已确认', assumed: '暂用假设', uncertain: '不确定' } as const

export function formBlock(wb: WorkbenchData): string {
  const f = wb.form
  return [
    `项目名：${f.projectName || '（未填）'}`,
    `主目标：${f.objective || '（未填）'}`,
    `时间尺度：${f.timeScale || '（未填）'}`,
    `当前阶段：${f.stage || '（未填）'}`,
    `当前最卡的 3 个问题：\n${list(f.blockers)}`,
    `背景：${f.background || '（未填）'}`,
    `已知客观事实：${f.knownFacts || '（未填）'}`,
    `敌（主要阻力）：${f.opponents || '（未填）'}`,
    `友（稳定助力）：${f.allies || '（未填）'}`,
    `可争取力量：${f.swing || '（未填）'}`
  ].join('\n')
}

export function factsBlock(wb: WorkbenchData): string {
  const facts = wb.intake?.facts ?? []
  if (!facts.length) return '（事实台账为空）'
  return facts
    .map((x) => `${x.id}｜${KIND_LABEL[x.kind]}｜${CONF_LABEL[x.confidence]}｜${x.content}`)
    .join('\n')
}

function questionsBlock(wb: WorkbenchData): string {
  const qs = wb.intake?.questions ?? []
  if (!qs.length) return '（无）'
  return qs.map((q) => `问：${q.question}\n答：${q.answer.trim() || '（未回答）'}`).join('\n')
}

function contradictionBlock(wb: WorkbenchData): string {
  const c = wb.diagnosis.contradiction
  if (!c) return '（未完成）'
  return [
    `全部矛盾：\n${list(c.all)}`,
    `主要矛盾：${c.primary}`,
    `主要方面：${c.mainAspect}`,
    `次要方面：${c.secondaryAspect}`,
    `为什么是主矛盾：${c.why}`,
    `转化条件：\n${list(c.turningConditions)}`,
    `当前抓手：${c.focus}`,
    `暂时不碰：\n${list(c.defer)}`,
    `依据：${c.factRefs.join('、') || '（无）'}`
  ].join('\n')
}

function routesBlock(wb: WorkbenchData): string {
  const r = wb.diagnosis.routes
  if (!r) return '（未完成）'
  return r.routes
    .map((x) =>
      [
        `【${routeName(x.key)}】`,
        `战略判断：${x.judgment}`,
        `方针：${x.policy}`,
        `可能结果：${x.result}`,
        `触发条件：${x.triggers.join('；')}`,
        `主要风险：${x.risks.join('；')}`,
        `切换信号：${x.switchSignals.join('；')}`
      ].join('\n')
    )
    .join('\n\n')
}

function objSubjBlock(wb: WorkbenchData): string {
  const o = wb.diagnosis.objSubj
  if (!o) return '（未完成）'
  const rows = WB_OBJSUBJ.map(
    (m) => `${m.group}·${m.name}：${o[m.key].score} 分｜${o[m.key].reason}`
  )
  return [
    ...rows,
    `当前具备的条件：${o.ready}`,
    `最大缺口：${o.biggestGap}`,
    `先补哪一项：${o.firstFix}`,
    `如果不补：${o.ifNotFixed}`
  ].join('\n')
}

function decisionBlock(wb: WorkbenchData): string {
  const d = wb.decision
  if (!d) return '（未完成）'
  return [
    `主要矛盾：${d.primaryContradiction}`,
    `推荐路线：${routeName(d.route)}｜${d.routeReason}`,
    `最大缺口：${d.biggestGap}`,
    `先打哪一仗：${d.firstBattle}`,
    `暂时不碰：\n${list(d.notNow)}`,
    `继续调查：\n${list(d.toInvestigate)}`
  ].join('\n')
}

function actionsBlock(wb: WorkbenchData): string {
  const queued = wb.actions.filter((a) => a.planningState === 'queued')
  const candidates = wb.actions.filter((a) => a.planningState !== 'queued')
  const status = { todo: '待办', done: '已完成', dropped: '已放弃' } as const
  const line = (a: (typeof wb.actions)[number], state: string): string => {
    const progress = a.progress
      .slice(-3)
      .map((p) => `    · ${p.text}`)
      .join('\n')
    return `- [${a.horizon}｜${state}] ${a.action}（验证：${a.verify}）${progress ? `\n${progress}` : ''}`
  }
  const queuedText = queued.length
    ? queued.map((a) => line(a, status[a.status])).join('\n')
    : '（还没有加入待办的行动）'
  const candidateText = candidates.length
    ? candidates.map((a) => line(a, '候选')).join('\n')
    : '（没有候选策略）'
  return [
    '【已加入待办 · 只有这些算执行承诺】',
    queuedText,
    '',
    '【候选策略 · 只是备选参考，用户还没决定做】',
    candidateText
  ].join('\n')
}

function ledgerBlock(wb: WorkbenchData, n = 5): string {
  const xs = wb.ledger.slice(-n)
  if (!xs.length) return '（无）'
  return xs
    .map(
      (e) =>
        `- ${e.createdAt.slice(0, 10)}｜${e.inputType}｜${e.summary || e.rawInput.slice(0, 80)}`
    )
    .join('\n')
}

/* ------------------------------ 第一步：摸清事实 ------------------------------ */

export const WB_INTAKE_SYSTEM = `${WB_RULES}

【当前任务】Phase 1 · 输入采集与事实切片。

把用户的原始输入和追问回答切成事实台账：
- 每条只写一件事，不超过 60 字，尽量保留用户原话里的数字和名词。
- kind：fact = 可核实的现状、数字、资源、已经做过的动作和结果；judgment = 用户自己的看法、推断、评价；wish = 想要的结果、期待。
- confidence：用户明确说出的事实 = confirmed；你为了继续分析而暂用的前提 = assumed（必须少而明确）；用户说法含糊、来源不明 = uncertain。
- 不得添加用户没有提供的事实。
- 已有台账里的条目（带 id）原样保留并带回 id；只有被追问回答明确推翻时才修改其内容或 confidence，并保留 id。新条目不写 id。
- 追问的回答要转成新的事实条目。

然后：
- missing：缺失的关键事实，每条写成“缺什么”，最多 5 条。
- questions：只问会改变方向的 3–5 个问题；已经回答过的不再重复问；事实足够时可以为空数组。why 写“不补会导致什么误判”。
- mainline：一句话主线。若用户同时有多个目标，指出哪个是主线。
- sideGoals：应该拆出去的支线目标，没有就空数组。

输出 JSON：
{"facts":[{"id":"F1 或省略","kind":"fact|judgment|wish","content":"","confidence":"confirmed|assumed|uncertain"}],"missing":[""],"questions":[{"question":"","why":""}],"mainline":"","sideGoals":[""]}`

export function buildWbIntakeUser(wb: WorkbenchData): string {
  return [
    '【原始输入】',
    formBlock(wb),
    '',
    '【已有事实台账】',
    factsBlock(wb),
    '',
    '【此前的追问与回答】',
    questionsBlock(wb)
  ].join('\n')
}

/* ------------------------------ 第二步：三路诊断 ------------------------------ */

function diagnoseContext(wb: WorkbenchData): string {
  return [
    '【原始输入】',
    formBlock(wb),
    '',
    '【事实台账】',
    factsBlock(wb),
    '',
    '【追问与回答】',
    questionsBlock(wb)
  ].join('\n')
}

export const WB_CONTRADICTION_SYSTEM = `${WB_RULES}

【当前任务】Agent A · 抓主要矛盾。你只负责主要矛盾，不写路线、不写行动清单。
方法依据：《矛盾论》——复杂过程里有许多矛盾，其中必定有一种是主要的，起着领导的、决定的作用；矛盾的两方面中，必有一方面是主要的。

要求：
1. all：先列出全部矛盾（3–6 条），每条写成“A 与 B 的矛盾”或具体卡点，不写口号。
2. primary：从中选出当前阶段的主要矛盾。不能只是复述用户的主目标或愿望。
3. mainAspect / secondaryAspect：主要矛盾里起决定作用的一方面、次要的一方面。
4. why：为什么它是当前主矛盾，必须引用事实编号，例如“F2、F5 显示……”。
5. turningConditions：哪些条件出现时，主要矛盾会转化（2–3 条）。
6. focus：当前最值得下手的一个抓手，具体到对象。
7. defer：暂时不碰的事（至少 1 条），并隐含“为什么后置”。
8. factRefs：你用到的事实编号（只能是台账里 kind=事实 的 F 编号）。
9. missingFacts：判断还依赖哪些补充事实。

输出 JSON：
{"all":[""],"primary":"","mainAspect":"","secondaryAspect":"","why":"","turningConditions":[""],"focus":"","defer":[""],"factRefs":["F1"],"missingFacts":[""]}`

export function buildWbContradictionUser(wb: WorkbenchData): string {
  return diagnoseContext(wb)
}

const ROUTE_TABLE = WB_ROUTES.map((r) => `- ${r.key}｜${r.name}｜${r.desc}`).join('\n')

export const WB_ROUTES_SYSTEM = `${WB_RULES}

【当前任务】Agent B · 三条路线推演。你只负责路线，不判断主要矛盾、不写行动清单。
方法依据：《论持久战》——不速胜，也不悲观，按阶段推演；《中国革命战争的战略问题》——战略退却是为了反攻，集中兵力打歼灭战。

固定三条路线（key 必须一一对应，顺序不变）：
${ROUTE_TABLE}

每条路线写：
- judgment：战略判断——在什么判断下走这条路。
- policy：方针——一句话怎么打。三条路线的方针必须有实质差异，不能只是换词。
- result：可能结果——写成条件判断，禁止写成确定事实。
- triggers：触发条件——什么情况下该选这条（1–3 条）。
- risks：主要风险（1–3 条）。
- switchSignals：切换信号——出现什么信号就该换到另一条路线，写出换到哪条（1–3 条）。

另给：factRefs（用到的事实编号）、missingFacts。

输出 JSON：
{"routes":[{"key":"steady","judgment":"","policy":"","result":"","triggers":[""],"risks":[""],"switchSignals":[""]},{"key":"breakthrough",...},{"key":"defensive",...}],"factRefs":["F1"],"missingFacts":[""]}`

export function buildWbRoutesUser(wb: WorkbenchData): string {
  return diagnoseContext(wb)
}

const OBJSUBJ_TABLE = WB_OBJSUBJ.map((m) => `- ${m.key}｜${m.group}·${m.name}｜${m.desc}`).join(
  '\n'
)

export const WB_OBJSUBJ_SYSTEM = `${WB_RULES}

【当前任务】Agent C · 主客分析法：成事 = 客观 3 + 主观 2。你只负责判断成事条件，不写路线、不写行动清单。
方法依据：《中国的红色政权为什么能够存在？》——一小块红色政权能长期存在，既要客观条件（统治势力之间的分裂和战争、全国革命形势向前发展），也要主观条件（相当力量的正式红军、党的组织有力量和政策不错误）。

五项：
${OBJSUBJ_TABLE}

每项给 score（1–5 整数，不用小数）和 reason（为什么是这个分，必须引用事实编号；事实不足就写明“依赖假设”并压低分数）。约束项绝不能省略。

然后：
- ready：当前已经具备哪些成事条件。
- biggestGap：最大缺口是哪一项、缺在哪。
- firstFix：先补哪一项、怎么补（具体到动作）。
- ifNotFixed：如果不补会发生什么（条件判断）。
- factRefs、missingFacts。

禁止只说“能成 / 不能成”。

输出 JSON：
{"trend":{"score":3,"reason":""},"resources":{"score":3,"reason":""},"constraints":{"score":3,"reason":""},"judgment":{"score":3,"reason":""},"execution":{"score":3,"reason":""},"ready":"","biggestGap":"","firstFix":"","ifNotFixed":"","factRefs":["F1"],"missingFacts":[""]}`

export function buildWbObjSubjUser(wb: WorkbenchData): string {
  return diagnoseContext(wb)
}

/* ------------------------------ 第三步：综合决策 ------------------------------ */

const ENHANCEMENT_TABLE = WB_ENHANCEMENTS.map(
  (e) => `- ${e.key}｜${e.name}｜适用：${e.when}｜要写出：${e.output}`
).join('\n')

export const WB_DECIDE_SYSTEM = `${WB_RULES}

【当前任务】Phase 3 · 综合与冲突修复（Conductor）。把三模块结果合成一份决策快照。

先检查三模块是否打架，典型冲突：
- 主要矛盾说要聚焦 A，抓手或路线却在做 B。
- 路线推演建议稳扎稳打，却默认多线铺开。
- 主客分析说资源不足（资源 ≤ 2 分），推荐路线却假设资源充足（例如主动突破线而不说明兵力从哪来）。
发现冲突必须在决策里修掉，并在 conflictsFixed 里写“冲突是什么 → 怎么修的”。没有冲突就空数组。

输出字段：
- primaryContradiction：当前主要矛盾（与 Agent A 一致；若修改，说明原因写进 conflictsFixed）。
- route：推荐主路线 key（steady | breakthrough | defensive）。
- routeReason：为什么选它，引用事实编号和主客分析分数。
- biggestGap：最大缺口。
- firstBattle：先打哪一仗——一个具体的首战，要对准主要矛盾的抓手。
- notNow：哪些事暂时不碰（至少 1 条）。
- toInvestigate：还需要继续调查的事实（最多 4 条）。
- enhancements：从下列可选增强模块中最多挑 2 个真正用得上的，point 写它落到的具体判断或动作（一句话）。用不上就空数组，不要为了展示概念堆名词。
${ENHANCEMENT_TABLE}

若输入里有【上一版检查未通过项】，必须逐条修复，并把修法写进 conflictsFixed。

输出 JSON：
{"primaryContradiction":"","route":"steady","routeReason":"","biggestGap":"","firstBattle":"","notNow":[""],"toInvestigate":[""],"conflictsFixed":[""],"enhancements":[{"key":"","point":""}]}`

export function buildWbDecideUser(wb: WorkbenchData, failing: WbCheck[]): string {
  const lines = [
    diagnoseContext(wb),
    '',
    '【Agent A · 主要矛盾】',
    contradictionBlock(wb),
    '',
    '【Agent B · 三条路线】',
    routesBlock(wb),
    '',
    '【Agent C · 主客分析】',
    objSubjBlock(wb)
  ]
  if (failing.length) {
    lines.push(
      '',
      '【上一版决策】',
      decisionBlock(wb),
      '',
      '【上一版检查未通过项】',
      list(failing.map((c) => c.message))
    )
  }
  return lines.join('\n')
}

export const WB_REDTEAM_SYSTEM = `${WB_RULES}

【当前任务】Agent E · Red-team Reviewer。你只负责找 fail，不重写内容，不提新的大方向（除非原方向明显不成立）。

逐项检查：
1. 事实不足却给了高确定性判断（引用的多是暂用假设或不确定条目）。
2. 主要矛盾判断过早：事实台账太薄，就下了主矛盾结论。
3. 主要矛盾只是复述愿望。
4. 路线推演缺风险或切换信号，或把预测写成确定事实。
5. 推荐路线和资源条件不匹配。
6. 先打的一仗没有对准主要矛盾。
7. （检查行动时）行动不服务主要矛盾、没有验证口径、和 KPI / 组织结果脱节、空话。

每个问题写一条 failItems：area 取 facts | contradiction | routes | objSubj | decision | actions；message 一句话写清“哪里不对 + 应该怎么修”。最多 6 条。没有问题就返回空数组，不要为了挑错而挑错。

输出 JSON：
{"failItems":[{"area":"decision","message":""}]}`

type WbAuditState = 'candidate' | 'todo' | 'done' | 'dropped'

const AUDIT_STATE_LABEL: Record<WbAuditState, string> = {
  candidate: '候选策略',
  todo: '待办',
  done: '已完成',
  dropped: '已放弃'
}

/** 候选不进入执行状态判断；已纳入的行动按 todo / done / dropped 区分执行结果。 */
function auditState(a: WbAction): WbAuditState {
  return a.planningState === 'candidate' ? 'candidate' : a.status
}

/** 行动审核输入：按执行状态分区，保证 todo / done / dropped 的变化一定改变提示词。 */
function auditActionsBlock(wb: WorkbenchData): string {
  const rows: Record<WbAuditState, string[]> = { candidate: [], todo: [], done: [], dropped: [] }
  for (const a of wb.actions) {
    const state = auditState(a)
    rows[state].push(
      `- [${a.horizon}｜${AUDIT_STATE_LABEL[state]}] 动作：${a.action}｜目的：${a.purpose}｜验证：${a.verify}｜执行标准：${a.standards.join('、')}｜KPI：${a.kpi}`
    )
  }
  const section = (title: string, items: string[]): string =>
    `${title}\n${items.join('\n') || '（无）'}`
  return [
    '行动状态：候选策略 = 用户还没选中，不算执行承诺；待办 = 已承诺执行且尚未完成，只有待办计入多线作战；已完成 = 已经做完；已放弃 = 用户明确不再做。',
    '',
    section('【候选策略 · 尚未承诺执行，仅供参考】', rows.candidate),
    '',
    section('【当前待办 · 已承诺执行且未完成，多线作战只看这里】', rows.todo),
    '',
    section('【已完成记录 · 已经做完，不计入当前执行负担】', rows.done),
    '',
    section('【已放弃记录 · 用户明确不再做，不计入执行负担】', rows.dropped)
  ].join('\n')
}

export function buildWbRedteamUser(wb: WorkbenchData, scope: 'decision' | 'actions'): string {
  const lines = [
    diagnoseContext(wb),
    '',
    '【主要矛盾】',
    contradictionBlock(wb),
    '',
    '【三条路线】',
    routesBlock(wb),
    '',
    '【主客分析】',
    objSubjBlock(wb),
    '',
    '【决策快照】',
    decisionBlock(wb)
  ]
  if (scope === 'actions') {
    lines.push(
      '',
      '【待审核的行动】',
      auditActionsBlock(wb),
      '',
      '注意：多线作战只统计【当前待办】里的行动；候选策略、已完成、已放弃都不算执行负担，不要把它们算进执行集中度。'
    )
  }
  lines.push(
    '',
    `【本次只审核】${scope === 'actions' ? '行动（第 7 条为主，兼顾与决策的一致性）' : '事实、三模块与决策快照（第 1–6 条）'}`
  )
  return lines.join('\n')
}

/* ------------------------------ 第四步：行动与复盘 ------------------------------ */

const STANDARD_TABLE = WB_STANDARDS.map(
  (s) => `- ${s.name}｜何时用：${s.when}｜写法：${s.hint}`
).join('\n')

export const WB_ACTIONS_SYSTEM = `${WB_RULES}

【当前任务】Agent D · Action Designer。只把已确认的决策转成行动，不改诊断。

数量：7d 2–4 条，30d 2–3 条，90d 1–2 条。7 天动作必须围绕“先打哪一仗”，集中兵力，不多线铺开。
每条行动：
- horizon：7d | 30d | 90d
- action：动作——具体对象 + 动作 + 数量或时限，例如“访谈 5 个流失客户，问清他们为什么没续费”。禁止“加强、提高、重视、推动”。
- purpose：目的——它打的是哪个矛盾、补的是哪个缺口。
- verify：验证——做到什么程度算完成，可观察、可计数。
- standards：毛选执行标准 1–3 个，只能从下表选名称：
${STANDARD_TABLE}
- kpi：与 KPI 或组织结果的关系——一句话。

你输出的每一条都只是候选策略：用户会逐条筛选后才加入待办，所以不要假设任何一条已经在执行。
已有行动分两类给出：已加入待办的是用户已承诺执行的，候选策略只是备选参考；已完成或已加入待办的不要重复，可以接着往下排。

输出 JSON：
{"actions":[{"horizon":"7d","action":"","purpose":"","verify":"","standards":["调查研究"],"kpi":""}]}`

export function buildWbActionsUser(wb: WorkbenchData): string {
  return [
    '【原始输入】',
    formBlock(wb),
    '',
    '【事实台账】',
    factsBlock(wb),
    '',
    '【已确认的决策快照】',
    decisionBlock(wb),
    '',
    '【主要矛盾的抓手】',
    wb.diagnosis.contradiction?.focus || '（无）',
    '',
    '【主客分析 · 先补哪一项】',
    wb.diagnosis.objSubj?.firstFix || '（无）',
    '',
    '【已有行动】',
    actionsBlock(wb)
  ].join('\n')
}

export const WB_RECAP_SYSTEM = `${WB_RULES}

【当前任务】复盘纠偏 + 实践认识循环（《实践论》：实践、认识、再实践、再认识）。
用户做了一段时间，带回了最新进展。你要形成一条追加进项目台账的记录，不覆盖旧记录。

【行动的两类状态】只有“已加入待办”的行动才是用户的执行承诺，可以作为已做的工作来复盘；
“候选策略”只是备选参考，没有被选择就不算做过，也不要当成执行成果。

输出：
- factDelta：这次新增或变化的事实（逐条，引用或对照旧事实编号）。
- judgmentDelta：判断上的变化——哪些旧判断被证实、哪些被推翻。
- actionsDelta：行动上的调整——继续、砍掉、新增什么（具体）。
- oldAssumptionsToFix：要修正的旧假设或旧判断（写出原判断和新看法）。
- summary：一句话本次复盘结论，不超过 60 字。
- newFacts：建议追加进事实台账的新条目（kind / content / confidence，不写 id）。
- rediagnose：新事实是否足以改变主要矛盾或推荐路线（true / false）。
- rediagnoseReason：一句话说明理由。

输出 JSON：
{"factDelta":[""],"judgmentDelta":[""],"actionsDelta":[""],"oldAssumptionsToFix":[""],"summary":"","newFacts":[{"kind":"fact","content":"","confidence":"confirmed"}],"rediagnose":false,"rediagnoseReason":""}`

export function buildWbRecapUser(wb: WorkbenchData, input: WbRecapInput): string {
  return [
    '【原始输入】',
    formBlock(wb),
    '',
    '【事实台账】',
    factsBlock(wb),
    '',
    '【当前决策】',
    decisionBlock(wb),
    '',
    '【行动与阶段记录】',
    actionsBlock(wb),
    '',
    '【最近的台账】',
    ledgerBlock(wb),
    '',
    '【这次的最新进展】',
    input.progress.trim() || '（未填）',
    '',
    '【哪些客观事实发生了变化】',
    input.factChanges.trim() || '（未填）',
    '',
    '【哪些旧判断要修正】',
    input.judgmentsToFix.trim() || '（未填）'
  ].join('\n')
}

/* ------------------------------ 右侧对话 ------------------------------ */

export function buildWbChatSystem(wb: WorkbenchData): string {
  return [
    `你是「毛选工作台」的参谋，陪用户推进这一个项目。

规则：
- 不是角色扮演，不用毛泽东第一人称，不评价历史人物、不讨论政治路线。
- 回答前先分清对方说的是事实、判断还是愿望；事实不足就追问，而不是替他脑补。
- 只基于下面的项目资料和他在对话里说的新情况；引用事实写 F 编号。
- 预测写成条件判断，不写“一定会”。不写空话，给出的建议要有对象、数量或时限。
- 他说出了新事实时，提醒他到「第一步 · 摸清事实」补进台账，或在「第四步 · 复盘」里记一笔，这样判断才会跟着更新。
- 用中文，一般不超过 250 字，可用短列表。`,
    '',
    '【项目原始输入】',
    formBlock(wb),
    '',
    '【事实台账】',
    factsBlock(wb),
    '',
    '【主要矛盾】',
    contradictionBlock(wb),
    '',
    '【主客分析】',
    objSubjBlock(wb),
    '',
    '【决策快照】',
    decisionBlock(wb),
    '',
    '【行动】',
    actionsBlock(wb),
    '',
    '【最近的台账】',
    ledgerBlock(wb)
  ].join('\n')
}
