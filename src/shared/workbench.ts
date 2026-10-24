import type {
  WbCheck,
  WbHorizon,
  WbObjSubj,
  WbRouteKey,
  WbStage,
  WbStepKey,
  WbTimeScale,
  WorkbenchData
} from './types'

export const WB_TIME_SCALES: { key: WbTimeScale; hint: string }[] = [
  { key: '7天', hint: '快速动作' },
  { key: '30天', hint: '阶段启动' },
  { key: '90天', hint: '结果验证' },
  { key: '1年', hint: '能力成型' },
  { key: '5年', hint: '结构性胜负' }
]

export const WB_STAGES: WbStage[] = ['起步', '相持', '攻坚', '扩张', '调整']

export const WB_STAGE_HINT: Record<WbStage, string> = {
  起步: '刚开局：先摸清情况、打开局面',
  相持: '推不动也垮不了：拼积累，等转机',
  攻坚: '关键一仗：集中兵力打下来',
  扩张: '样板已成：复制推广',
  调整: '路线要改：先止损，再重来'
}

export const WB_ROUTES: { key: WbRouteKey; name: string; desc: string }[] = [
  { key: 'steady', name: '稳扎稳打线', desc: '先守住基本盘，小步验证，积小胜为大胜' },
  { key: 'breakthrough', name: '主动突破线', desc: '集中兵力打一个关键点，抢时间窗口' },
  { key: 'defensive', name: '保守防御线', desc: '先止损保存力量，等条件变化再动' }
]

export function routeName(key: WbRouteKey | string): string {
  return WB_ROUTES.find((r) => r.key === key)?.name ?? key
}

export type WbObjSubjKey = 'trend' | 'resources' | 'constraints' | 'judgment' | 'execution'

export const WB_OBJSUBJ: {
  key: WbObjSubjKey
  group: '客观' | '主观'
  name: string
  desc: string
}[] = [
  { key: 'trend', group: '客观', name: '趋势', desc: '大势是否顺风' },
  { key: 'resources', group: '客观', name: '资源', desc: '钱、人、时间、渠道、品牌、技术' },
  {
    key: 'constraints',
    group: '客观',
    name: '约束',
    desc: '政策、竞争、时点、组织、认知惯性（分越高 = 约束越可控）'
  },
  { key: 'judgment', group: '主观', name: '判断', desc: '看清主要矛盾、阶段和路线的能力' },
  {
    key: 'execution',
    group: '主观',
    name: '组织执行',
    desc: '调动人、拆动作、盯结果、复盘纠偏的能力'
  }
]

export const WB_HORIZONS: { key: WbHorizon; name: string; hint: string }[] = [
  { key: '7d', name: '7 天动作', hint: '快速动作：马上能做、能看到反馈' },
  { key: '30d', name: '30 天动作', hint: '阶段启动：把首战打下来' },
  { key: '90d', name: '90 天动作', hint: '结果验证：看路线对不对，决定复制还是切换' }
]

/** 毛选执行标准：每条行动至少挂 1 个，写法提示用于提示词与界面说明。 */
export const WB_STANDARDS: { name: string; when: string; hint: string }[] = [
  {
    name: '实事求是',
    when: '需要从概念回到真实指标、真实约束时',
    hint: '写清事实、指标、约束，不从愿望出发'
  },
  {
    name: '抓主要矛盾',
    when: '需要聚焦少数关键战点时',
    hint: '说明为什么先做这件事、其他事为何后置'
  },
  {
    name: '调查研究',
    when: '需要补一手信息、摸清现状时',
    hint: '写清调研对象、样本、要验证的问题'
  },
  {
    name: '群众路线',
    when: '需要吸收一线反馈形成方案时',
    hint: '写清如何从一线收集，再如何集中提炼'
  },
  { name: '统一战线', when: '需要拉通多方资源时', hint: '写清要团结哪些人，他们为什么会支持' },
  { name: '试点推进', when: '需要先做样板再复制时', hint: '写清为什么先小范围试点' },
  { name: '集中兵力', when: '资源有限、不能多线作战时', hint: '写清为什么只打 1 到 2 个点' },
  { name: '复盘纠偏', when: '需要按阶段校正路线时', hint: '写清复盘频率、复盘输出和修正动作' },
  {
    name: '不打无准备之仗',
    when: '需要前置扫雷和准备时',
    hint: '写清前置依赖、放行条件和风险清单'
  },
  { name: '从个别到一般', when: '首战后准备复制时', hint: '写清如何把个案沉淀成方法' },
  { name: '星星之火可以燎原', when: '单点突破可撬动全局时', hint: '写清这个样板为什么值得先点燃' }
]

export const WB_STANDARD_NAMES = WB_STANDARDS.map((s) => s.name)

/** 可选增强模块：只能增强主流程，不得替代三大核心模块；最多启用 2 个。 */
export const WB_ENHANCEMENTS: {
  key: string
  name: string
  when: string
  output: string
  triggers: RegExp
}[] = [
  {
    key: 'practice',
    name: '实践认识循环',
    when: '已经行动过，或需要边做边修正',
    output: '实践、反馈、修正后的新认识、下一轮动作',
    triggers: /(试过|做过|上次|结果不|反馈|继续|最新进展|判断错)/
  },
  {
    key: 'protracted',
    name: '持久战阶段论',
    when: '时间尺度超过 90 天，或目标是 1–5 年',
    output: '区分起步、相持、攻坚、扩张、调整，不把长期目标压成短期冲刺',
    triggers: /(长期|五年|5年|一年|1年|阶段|路线|熬)/
  },
  {
    key: 'base',
    name: '根据地 / 试点',
    when: '项目太大、资源有限、需要先小范围验证',
    output: '首个根据地、样板标准、复制条件',
    triggers: /(试点|样板|先做一个|根据地|小范围|MVP)/i
  },
  {
    key: 'twoSides',
    name: '一分为二',
    when: '观点过于单边，或外部观点极端',
    output: '同时写积极面、消极面、适用边界',
    triggers: /(太难|没机会|阶层固化|肯定不行|一定能|所有人都)/
  },
  {
    key: 'paperTiger',
    name: '纸老虎',
    when: '被宏大风险吓住，行动停滞',
    output: '战略上指出风险可拆，战术上列出准备动作',
    triggers: /(焦虑|害怕|不敢|被压|压力大|吓)/
  },
  {
    key: 'selfReliance',
    name: '自力更生 + 外援',
    when: '资源不足但可借力',
    output: '内部可控能力、外部可借资源、不能依赖外援的部分',
    triggers: /(资源不够|没钱|没人|缺人|借力|外援)/
  },
  {
    key: 'massLine',
    name: '群众路线',
    when: '需要吸收一线反馈或争取用户 / 业务支持',
    output: '调研对象、收集方式、如何集中成方案',
    triggers: /(一线|用户|客户|业务部门|群众|反馈)/
  },
  {
    key: 'unitedFront',
    name: '统一战线',
    when: '需要跨部门、跨角色推进',
    output: '要团结谁、各自利益、共同目标和最小合作动作',
    triggers: /(跨部门|没人支持|要拉人|协同|合作|领导|老板|同事)/
  },
  {
    key: 'rectify',
    name: '复盘纠偏',
    when: '续写旧项目或阶段结束',
    output: '旧判断、新事实、修正项、新动作',
    triggers: /(复盘|纠偏|上次判断|修正|回顾)/
  }
]

export function enhancementName(key: string): string {
  return WB_ENHANCEMENTS.find((e) => e.key === key)?.name ?? key
}

export type WbSourceArea = 'intake' | 'contradiction' | 'routes' | 'objSubj' | 'act'

/** 各模块对应的原文依据；quote 已核对为原文中的连续子串，用 paragraphs.findIndex(p => p.includes(quote)) 定位。 */
export const WB_SOURCES: {
  area: WbSourceArea
  articleId: string
  title: string
  quote: string
  use: string
}[] = [
  {
    area: 'intake',
    articleId: 'Section0205',
    title: '反对本本主义',
    quote: '没有调查，没有发言权',
    use: '先调查，后判断'
  },
  {
    area: 'intake',
    articleId: 'Section0205',
    title: '反对本本主义',
    quote: '调查就是解决问题',
    use: '缺的事实，靠调查补'
  },
  {
    area: 'contradiction',
    articleId: 'Section0216',
    title: '矛盾论',
    quote: '捉住了这个主要矛盾，一切问题就迎刃而解了',
    use: '多个矛盾里找出起决定作用的那一个'
  },
  {
    area: 'contradiction',
    articleId: 'Section0216',
    title: '矛盾论',
    quote: '矛盾着的两方面中，必有一方面是主要的，他方面是次要的',
    use: '分清主要方面与次要方面'
  },
  {
    area: 'routes',
    articleId: 'Section0309',
    title: '论持久战',
    quote: '中国能够速胜吗？答复：不能速胜，抗日战争是持久战。',
    use: '不速胜，也不悲观：按阶段推演'
  },
  {
    area: 'routes',
    articleId: 'Section0211',
    title: '中国革命战争的战略问题',
    quote: '战略退却，是劣势军队处在优势军队进攻面前',
    use: '保守防御不是认输，是为了反攻'
  },
  {
    area: 'objSubj',
    articleId: 'Section0201',
    title: '中国的红色政权为什么能够存在？',
    quote: '全国革命形势是向前发展的',
    use: '客观条件：大势'
  },
  {
    area: 'objSubj',
    articleId: 'Section0201',
    title: '中国的红色政权为什么能够存在？',
    quote: '就是共产党组织的有力量和它的政策的不错误',
    use: '主观条件：组织与判断'
  },
  {
    area: 'act',
    articleId: 'Section0215',
    title: '实践论',
    quote: '实践、认识、再实践、再认识',
    use: '做了再改，改了再做'
  },
  {
    area: 'act',
    articleId: 'Section0413',
    title: '关于领导方法的若干问题',
    quote: '从群众中来，到群众中去',
    use: '一线反馈 → 集中 → 再回到一线'
  }
]

/* ------------------------------ 步骤门槛 ------------------------------ */

export function wbStepUnlocked(
  wb: WorkbenchData,
  step: WbStepKey
): { ok: boolean; reason: string } {
  switch (step) {
    case 'wb_intake':
      return { ok: true, reason: '' }
    case 'wb_diagnose':
      if (wb.form.objective.trim().length < 6)
        return { ok: false, reason: '先写清楚主目标（至少 6 字）' }
      if (!wb.form.blockers.some((b) => b.trim()))
        return { ok: false, reason: '至少写 1 个当前最卡的问题' }
      if (!wb.intake) return { ok: false, reason: '先让 AI 整理事实台账' }
      return { ok: true, reason: '' }
    case 'wb_decide': {
      const d = wb.diagnosis
      if (!d.contradiction || !d.routes || !d.objSubj)
        return { ok: false, reason: '三路诊断都完成后才能综合' }
      return { ok: true, reason: '' }
    }
    case 'wb_act':
      if (!wb.decision?.confirmed) return { ok: false, reason: '先确认综合决策' }
      return { ok: true, reason: '' }
  }
}

export function wbStepDone(wb: WorkbenchData, step: WbStepKey): boolean {
  switch (step) {
    case 'wb_intake':
      return wb.intake !== null
    case 'wb_diagnose':
      return Boolean(wb.diagnosis.contradiction && wb.diagnosis.routes && wb.diagnosis.objSubj)
    case 'wb_decide':
      return Boolean(wb.decision?.confirmed)
    case 'wb_act':
      return (
        wb.actions.some((a) => a.planningState === 'queued' && a.status === 'done') ||
        wb.ledger.some((e) => e.inputType !== 'new')
      )
  }
}

/** 追问里用户没回答、且台账没有任何 confirmed 事实时，结论只能是“假设版”。 */
export function isAssumptionDraft(wb: WorkbenchData): boolean {
  const confirmed =
    wb.intake?.facts.some((f) => f.kind === 'fact' && f.confidence === 'confirmed') ?? false
  const unanswered = wb.intake?.questions.some((q) => !q.answer.trim()) ?? false
  return !confirmed || unanswered
}

/* ------------------------------ 硬规则检查 ------------------------------ */

const OVERCONFIDENT = /(一定会|必然会|必然|肯定会|确定会|毫无疑问|百分之百|注定)/
const EMPTY_WORDS = /(加强|提高|重视|推动|强化|提升|做好|落实|加大力度|持续优化)/

function rule(area: WbCheck['area'], id: string, passed: boolean, message: string): WbCheck {
  return { id: `rule:${id}`, source: 'rule', area, passed, message, waived: false }
}

function filled(s: string | undefined | null): boolean {
  return Boolean(s && s.trim())
}

function scoreOk(s: WbObjSubj['trend']): boolean {
  return Number.isInteger(s.score) && s.score >= 1 && s.score <= 5 && filled(s.reason)
}

/** 第三步决策的硬规则：覆盖事实、三模块与决策本身。只返回检查结果，不改数据。 */
export function ruleChecksDecision(wb: WorkbenchData): WbCheck[] {
  const out: WbCheck[] = []
  const facts = wb.intake?.facts ?? []
  const confirmed = facts.filter((f) => f.kind === 'fact' && f.confidence === 'confirmed').length
  out.push(
    rule(
      'facts',
      'F-1',
      confirmed > 0,
      confirmed > 0
        ? `事实台账有 ${confirmed} 条已确认事实`
        : '没有任何已确认事实，所有判断都只是假设版'
    )
  )
  const unanswered = wb.intake?.questions.filter((q) => !q.answer.trim()).length ?? 0
  out.push(
    rule(
      'facts',
      'F-2',
      unanswered === 0,
      unanswered === 0 ? '追问已全部回答' : `还有 ${unanswered} 个追问没回答，判断依赖补充事实`
    )
  )

  const c = wb.diagnosis.contradiction
  if (c) {
    out.push(
      rule(
        'contradiction',
        'C-1',
        c.all.length >= 2,
        c.all.length >= 2 ? '已列出全部矛盾' : '没列全部矛盾就直接给了主要矛盾'
      )
    )
    const objective = wb.form.objective.trim()
    const parrot = filled(objective) && c.primary.trim() === objective
    out.push(
      rule(
        'contradiction',
        'C-2',
        filled(c.primary) && !parrot,
        parrot ? '主要矛盾只是复述了主目标' : filled(c.primary) ? '主要矛盾已给出' : '缺主要矛盾'
      )
    )
    out.push(
      rule(
        'contradiction',
        'C-3',
        filled(c.why),
        filled(c.why) ? '说明了为什么是主要矛盾' : '没有说明为什么它是当前主要矛盾'
      )
    )
    out.push(
      rule(
        'contradiction',
        'C-4',
        c.defer.length >= 1,
        c.defer.length >= 1 ? '写了暂时不碰的事' : '没有写“暂时不碰”'
      )
    )
    out.push(
      rule(
        'contradiction',
        'C-5',
        c.factRefs.length >= 1,
        c.factRefs.length >= 1
          ? `主要矛盾引用了 ${c.factRefs.join('、')}`
          : '主要矛盾没有引用任何事实'
      )
    )
  }

  const r = wb.diagnosis.routes
  if (r) {
    const keys = new Set(r.routes.map((x) => x.key))
    out.push(
      rule('routes', 'R-1', keys.size === 3, keys.size === 3 ? '三条路线齐全' : '路线少于三条')
    )
    r.routes.forEach((x) => {
      const ok = x.triggers.length > 0 && x.risks.length > 0 && x.switchSignals.length > 0
      out.push(
        rule(
          'routes',
          `R-2-${x.key}`,
          ok,
          ok
            ? `${routeName(x.key)}：触发条件、风险、切换信号齐全`
            : `${routeName(x.key)}：缺触发条件、主要风险或切换信号`
        )
      )
      const bold = OVERCONFIDENT.test(x.result)
      out.push(
        rule(
          'routes',
          `R-3-${x.key}`,
          !bold,
          bold
            ? `${routeName(x.key)}：把可能结果写成了确定事实`
            : `${routeName(x.key)}：结果写成了条件判断`
        )
      )
    })
    const policies = r.routes.map((x) => x.policy.trim()).filter(Boolean)
    const distinct = new Set(policies).size === policies.length
    out.push(
      rule(
        'routes',
        'R-4',
        distinct,
        distinct ? '三条路线方针有实质差异' : '有路线方针完全相同，只是换词'
      )
    )
  }

  const o = wb.diagnosis.objSubj
  if (o) {
    const all = [o.trend, o.resources, o.constraints, o.judgment, o.execution]
    const ok = all.every(scoreOk)
    out.push(
      rule('objSubj', 'O-1', ok, ok ? '客观 3 + 主观 2 都有分数和理由' : '有项目缺分数或缺理由')
    )
    out.push(
      rule(
        'objSubj',
        'O-2',
        filled(o.constraints.reason),
        filled(o.constraints.reason) ? '写了约束' : '忽略了约束'
      )
    )
    const gap = filled(o.biggestGap) && filled(o.firstFix)
    out.push(
      rule(
        'objSubj',
        'O-3',
        gap,
        gap ? '指出了最大缺口和补法' : '没有指出最大缺口或没把缺口转成补法'
      )
    )
  }

  const d = wb.decision
  if (d) {
    out.push(
      rule(
        'decision',
        'D-1',
        filled(d.primaryContradiction) && filled(d.firstBattle),
        filled(d.firstBattle) ? '写了先打哪一仗' : '没写先打哪一仗'
      )
    )
    out.push(
      rule(
        'decision',
        'D-2',
        d.notNow.length >= 1,
        d.notNow.length >= 1 ? '写了哪些事暂时不碰' : '没写哪些事暂时不碰'
      )
    )
    if (o) {
      const weak = o.resources.score <= 2 && d.route === 'breakthrough'
      out.push(
        rule(
          'decision',
          'D-3',
          !weak,
          weak
            ? `资源只有 ${o.resources.score} 分，却推荐主动突破线：先说明兵力从哪来，或改路线`
            : '推荐路线与资源条件匹配'
        )
      )
    }
  }
  return out
}

/** 候选池覆盖：7 / 30 / 90 天是否都有备选。只回答“有没有想到”，不衡量执行量。 */
export function ruleChecksCandidatePool(wb: WorkbenchData): WbCheck[] {
  const pool = wb.actions.filter((a) => a.status !== 'dropped')
  return WB_HORIZONS.map((h) => {
    const n = pool.filter((a) => a.horizon === h.key).length
    return rule(
      'actions',
      `A-1-${h.key}`,
      n > 0,
      n > 0 ? `${h.name}：${n} 条候选 / 已纳入` : `${h.name}：还没有`
    )
  })
}

/** 候选内容质量：字段是否齐全、动作是否具体、执行标准是否在清单里。 */
export function ruleChecksActionContent(wb: WorkbenchData): WbCheck[] {
  const out: WbCheck[] = []
  const live = wb.actions.filter((a) => a.status !== 'dropped')
  live.forEach((a, i) => {
    const label = `第 ${i + 1} 条「${a.action.slice(0, 16) || '未命名'}」`
    const complete =
      filled(a.action) &&
      filled(a.purpose) &&
      filled(a.verify) &&
      filled(a.kpi) &&
      a.standards.length > 0
    out.push(
      rule(
        'actions',
        `A-2-${a.id}`,
        complete,
        complete ? `${label}字段齐全` : `${label}缺动作 / 目的 / 验证 / 执行标准 / KPI 关系`
      )
    )
    const vague = EMPTY_WORDS.test(a.action) && !/\d/.test(a.action)
    out.push(
      rule(
        'actions',
        `A-3-${a.id}`,
        !vague,
        vague ? `${label}是空话：换成具体对象、数量、时限` : `${label}动作具体`
      )
    )
    const unknown = a.standards.filter((s) => !WB_STANDARD_NAMES.includes(s))
    if (unknown.length)
      out.push(
        rule('actions', `A-4-${a.id}`, false, `${label}的执行标准不在清单里：${unknown.join('、')}`)
      )
  })
  return out
}

/** 执行组合集中度：只有“已加入待办且未完成”的 7 天动作才占当前兵力。 */
export function ruleChecksExecutionLoad(wb: WorkbenchData): WbCheck[] {
  const active = wb.actions.filter(
    (a) => a.planningState === 'queued' && a.status === 'todo' && a.horizon === '7d'
  ).length
  return [
    rule(
      'actions',
      'A-5',
      active <= 5,
      active <= 5
        ? `7 天待办 ${active} 条，兵力集中`
        : `7 天待办 ${active} 条，多线作战了，先从候选里砍到 5 条以内`
    )
  ]
}

/** 第四步行动的硬规则：候选池覆盖 + 内容质量 + 执行组合集中度。只读，不改数据。 */
export function ruleChecksActions(wb: WorkbenchData): WbCheck[] {
  return [
    ...ruleChecksCandidatePool(wb),
    ...ruleChecksActionContent(wb),
    ...ruleChecksExecutionLoad(wb)
  ]
}

/** 重新检查后，沿用用户对同 id 同内容检查项的“已知晓”标记。 */
export function mergeWaived(prev: WbCheck[], next: WbCheck[]): WbCheck[] {
  const waived = new Set(prev.filter((c) => c.waived).map((c) => `${c.id}|${c.message}`))
  return next.map((c) => (waived.has(`${c.id}|${c.message}`) ? { ...c, waived: true } : c))
}

export function blockingChecks(checks: WbCheck[]): WbCheck[] {
  return checks.filter((c) => !c.passed && !c.waived)
}

/** 台账 rawInput 用：把表单和已回答的追问逐字拼成一段原始输入记录。 */
export function wbRawInputText(wb: WorkbenchData): string {
  const f = wb.form
  const lines = [
    `项目名：${f.projectName}`,
    `主目标：${f.objective}`,
    `时间尺度：${f.timeScale}`,
    `当前阶段：${f.stage}`,
    `最卡的问题：${f.blockers.filter((b) => b.trim()).join('；')}`,
    `背景：${f.background}`,
    `已知客观事实：${f.knownFacts}`,
    `敌：${f.opponents}`,
    `友：${f.allies}`,
    `可争取：${f.swing}`
  ].filter((l) => !/：$/.test(l))
  const answered = (wb.intake?.questions ?? []).filter((q) => q.answer.trim())
  if (answered.length) {
    lines.push('追问回答：')
    for (const q of answered) lines.push(`- ${q.question} → ${q.answer.trim()}`)
  }
  return lines.join('\n')
}

/** 下一个事实 id：F 后面的最大数字 + 1。 */
export function nextFactNo(ids: string[]): number {
  let max = 0
  for (const id of ids) {
    const m = /^F(\d+)$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}
