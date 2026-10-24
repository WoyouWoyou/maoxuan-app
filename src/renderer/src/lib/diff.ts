import type { SessionData } from '@shared/types'

const IGNORED_FIELDS = new Set([
  'generatedAt',
  'createdAt',
  'startedAt',
  '_context',
  'schemaVersion'
])

interface Seg {
  key: string
  index: number | null
}

export interface FieldDiff {
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: string
  after?: string
}

/**
 * 把任意对象拍平成 `path -> 字符串值`。
 * 对象用 `a.b`，数组用 `a[0]`；空数组记 `[]`，空对象记 `{}`；null / undefined 视为不存在。
 * 时间字段（generatedAt / createdAt / startedAt）不参与对比。
 */
export function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}

  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out[path] = '[]'
        return
      }
      value.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) {
        out[path] = '{}'
        return
      }
      for (const [key, child] of entries) {
        if (IGNORED_FIELDS.has(key)) continue
        walk(child, path ? `${path}.${key}` : key)
      }
      return
    }
    if (value === null || value === undefined) return
    out[path] = typeof value === 'string' ? value : String(value)
  }

  walk(obj, prefix)
  return out
}

/** 以 newData 的顺序列出差异；旧数据里被删除的字段排在最后。 */
export function diffData(oldData: SessionData, newData: SessionData): FieldDiff[] {
  const before = flatten(oldData)
  const after = flatten(newData)
  const diffs: FieldDiff[] = []

  for (const path of Object.keys(after)) {
    const b = before[path]
    const a = after[path]
    if (b === undefined) diffs.push({ path, kind: 'added', after: a })
    else if (b !== a) diffs.push({ path, kind: 'changed', before: b, after: a })
  }
  for (const path of Object.keys(before)) {
    if (!(path in after)) diffs.push({ path, kind: 'removed', before: before[path] })
  }

  return diffs
}

function parsePath(path: string): Seg[] {
  const segs: Seg[] = []
  for (const part of path.split('.')) {
    const m = /^([^[\]]+?)(?:\[(\d+)\])?$/.exec(part)
    if (!m) {
      segs.push({ key: part, index: null })
      continue
    }
    segs.push({ key: m[1], index: m[2] === undefined ? null : Number(m[2]) })
  }
  return segs
}

/** 模板里的 `[n]` 是数组下标，`{k}` 是第 k 个下标的 1 起序号。 */
const LABEL_TEMPLATES: Record<string, string> = {
  problem: '问题',
  'problem.text': '问题',
  'problem.background': '背景',
  'problem.tried': '已尝试',

  diagnosis: '诊断',
  'diagnosis.restated': '诊断·复述',
  'diagnosis.symptoms': '诊断·症状',
  'diagnosis.symptoms[n]': '诊断·症状 {1}',
  'diagnosis.mainContradiction': '诊断·主要矛盾',
  'diagnosis.stage': '诊断·所处阶段',
  'diagnosis.recommendations': '诊断·推荐篇目',
  'diagnosis.recommendations[n]': '推荐 {1}',
  'diagnosis.recommendations[n].articleId': '推荐 {1} · 文章',
  'diagnosis.recommendations[n].title': '推荐 {1} · 标题',
  'diagnosis.recommendations[n].reason': '推荐 {1} · 理由',
  'diagnosis.recommendations[n].focusQuestion': '推荐 {1} · 带着读的问题',

  readings: '阅读篇目',
  'readings[n]': '阅读 {1}',
  'readings[n].articleId': '阅读 {1} · 文章',
  'readings[n].title': '阅读 {1} · 标题',
  'readings[n].focusQuestion': '阅读 {1} · 带着读的问题',
  'readings[n].readDone': '阅读 {1} · 已读完',
  'readings[n].passages': '阅读 {1} · 标注段落',
  'readings[n].passages[n]': '阅读 {1} · 标注 {2}',
  'readings[n].passages[n].paragraphIndex': '阅读 {1} · 标注 {2} · 段落下标',
  'readings[n].passages[n].quote': '阅读 {1} · 标注 {2} · 原文',
  'readings[n].passages[n].why': '阅读 {1} · 标注 {2} · 说明',
  'readings[n].passages[n].verified': '阅读 {1} · 标注 {2} · 已核对原文',
  'readings[n].notes': '阅读 {1} · 笔记',
  'readings[n].notes.coreMethod': '阅读 {1} · 笔记·核心方法',
  'readings[n].notes.relatedProblem': '阅读 {1} · 笔记·关联问题',
  'readings[n].notes.action': '阅读 {1} · 笔记·具体行动',
  'readings[n].notesDone': '阅读 {1} · 笔记已完成',
  'readings[n].feedback': '阅读 {1} · 批改',
  'readings[n].feedback.passed': '阅读 {1} · 批改·是否通过',
  'readings[n].feedback.scores': '阅读 {1} · 批改·得分',
  'readings[n].feedback.scores.coreMethod': '阅读 {1} · 批改·核心方法得分',
  'readings[n].feedback.scores.relatedProblem': '阅读 {1} · 批改·关联问题得分',
  'readings[n].feedback.scores.action': '阅读 {1} · 批改·具体行动得分',
  'readings[n].feedback.comments': '阅读 {1} · 批改·评语',
  'readings[n].feedback.comments[n]': '阅读 {1} · 批改·评语 {2}',
  'readings[n].feedback.rereadParagraphs': '阅读 {1} · 批改·建议重读段落',
  'readings[n].feedback.rereadParagraphs[n]': '阅读 {1} · 批改·建议重读 {2}',

  actions: '行动清单',
  'actions[n]': '行动 {1}',
  'actions[n].id': '行动 {1} · 编号',
  'actions[n].text': '行动 {1} · 内容',
  'actions[n].fromArticleId': '行动 {1} · 来源文章',
  'actions[n].dueDate': '行动 {1} · 截止日',
  'actions[n].status': '行动 {1} · 状态',
  'actions[n].result': '行动 {1} · 结果',
  'actions[n].progress': '行动 {1} · 阶段进展',
  'actions[n].progress[n]': '行动 {1} · 第 {2} 阶段',
  'actions[n].progress[n].id': '行动 {1} · 第 {2} 阶段 · 编号',
  'actions[n].progress[n].text': '行动 {1} · 第 {2} 阶段 · 内容',
  'actions[n].progress[n].createdAt': '行动 {1} · 第 {2} 阶段 · 时间',

  reviews: '复盘记录',
  'reviews[n]': '复盘 {1}',
  'reviews[n].id': '复盘 {1} · 编号',
  'reviews[n].newSituation': '复盘 {1} · 新情况',
  'reviews[n].rereadArticleIds': '复盘 {1} · 建议重读篇目',
  'reviews[n].rereadArticleIds[n]': '复盘 {1} · 建议重读 {2}',
  'reviews[n].advice': '复盘 {1} · 建议',

  mindset: '心法',
  'mindset.mainContradiction': '心法·主要矛盾',
  'mindset.stage': '心法·所处阶段',
  'mindset.firstStep': '心法·第一步',

  workbench: '工作台',
  'workbench.form.projectName': '工作台·项目名',
  'workbench.form.objective': '工作台·主目标',
  'workbench.form.timeScale': '工作台·时间尺度',
  'workbench.form.stage': '工作台·当前阶段',
  'workbench.form.knownFacts': '工作台·已知事实',
  'workbench.intake': '工作台·事实台账',
  'workbench.intake.mainline': '工作台·主线',
  'workbench.intake.facts': '工作台·事实',
  'workbench.intake.questions': '工作台·追问',
  'workbench.diagnosis': '工作台·三路诊断',
  'workbench.diagnosis.contradiction': '工作台·主要矛盾分析',
  'workbench.diagnosis.routes': '工作台·三条路线',
  'workbench.diagnosis.objSubj': '工作台·主客分析',
  'workbench.decision': '工作台·综合决策',
  'workbench.decision.route': '工作台·推荐路线',
  'workbench.decision.firstBattle': '工作台·先打哪一仗',
  'workbench.decision.confirmed': '工作台·决策已确认',
  'workbench.actions': '工作台行动',
  'workbench.actions[n]': '工作台行动 {1}',
  'workbench.actions[n].action': '工作台行动 {1} · 动作',
  'workbench.actions[n].horizon': '工作台行动 {1} · 周期',
  'workbench.actions[n].planningState': '工作台行动 {1} · 待办纳入状态',
  'workbench.actions[n].status': '工作台行动 {1} · 执行状态',
  'workbench.actions[n].purpose': '工作台行动 {1} · 目的',
  'workbench.actions[n].verify': '工作台行动 {1} · 验证',
  'workbench.actions[n].kpi': '工作台行动 {1} · 与 KPI 的关系',
  'workbench.actions[n].standards': '工作台行动 {1} · 执行标准',
  'workbench.actions[n].quadrant': '工作台行动 {1} · 象限',
  'workbench.actions[n].dueDate': '工作台行动 {1} · 截止日',
  'workbench.actions[n].progress': '工作台行动 {1} · 阶段进展',
  'workbench.actions[n].progress[n]': '工作台行动 {1} · 第 {2} 阶段',
  'workbench.actions[n].progress[n].text': '工作台行动 {1} · 第 {2} 阶段 · 内容',
  'workbench.ledger': '工作台·项目台账',
  'workbench.ledger[n]': '工作台·台账 {1}',
  'workbench.ledger[n].summary': '工作台·台账 {1} · 摘要'
}

/** 把扁平路径翻译成中文可读标签；未知路径原样返回。 */
export function labelOfPath(path: string): string {
  if (!path) return path
  const segs = parsePath(path)
  if (segs.length === 0) return path

  const numbers: number[] = []
  const template = segs
    .map((seg) => {
      if (seg.index === null) return seg.key
      numbers.push(seg.index + 1)
      return `${seg.key}[n]`
    })
    .join('.')

  const label = LABEL_TEMPLATES[template]
  if (!label) return path

  return label.replace(/\{(\d+)\}/g, (_all, raw: string) => {
    const value = numbers[Number(raw) - 1]
    return value === undefined ? '' : String(value)
  })
}
