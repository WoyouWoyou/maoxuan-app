import { randomUUID } from 'node:crypto'
import { CORE_ARTICLES } from '@shared/core'
import type {
  Article,
  ArticleRecommendation,
  ChatMessage,
  Diagnosis,
  Mindset,
  NoteFeedback,
  Passage,
  ProblemInput,
  ProblemRevision,
  Review,
  SessionData,
  Settings,
  ThreeNotes
} from '@shared/types'
import { callJson, type LlmMessage } from '../../model-runtime/public'
import {
  DIAGNOSE_SYSTEM,
  FIND_PASSAGES_SYSTEM,
  MINDSET_SYSTEM,
  REVISE_PROBLEM_SYSTEM,
  REVIEW_NOTES_SYSTEM,
  REVIEW_SITUATION_SYSTEM,
  buildChatSystem,
  buildDiagnoseUser,
  buildFindPassagesUser,
  buildMindsetUser,
  buildReviewNotesUser,
  buildReviewSituationUser,
  buildReviseProblemUser
} from './maoxuan-prompts'

const NO_API_KEY = '请先在设置中填写 DeepSeek API Key'

/** findPassages 发送给模型的段落文本上限。 */
const MAX_PROMPT_CHARS = 60_000
/** 只有全文超过这个长度才做段落筛选。 */
const FULLTEXT_LIMIT = 60_000

const CORE_BY_ID = new Map(CORE_ARTICLES.map((a) => [a.articleId, a]))

function ensureKey(s: Settings): void {
  if (!s || typeof s.apiKey !== 'string' || !s.apiKey.trim()) throw new Error(NO_API_KEY)
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, max)
}

/* ------------------------------ 第一步：明确问题 ------------------------------ */

const FALLBACK_RULES: { pattern: RegExp; articleId: string }[] = [
  { pattern: /(想|计划|方案|空想|拖延|迟迟|没动|执行|行动|纸上|主观)/, articleId: 'Section0215' },
  { pattern: /(乱|杂|多头|重点|抓不住|纠结|同时|都想要|矛盾)/, articleId: 'Section0216' },
  { pattern: /(急|放弃|看不到希望|熬|坚持|很久|太久|慢|撑不住)/, articleId: 'Section0309' },
  { pattern: /(别人|照搬|经验|模仿|跟着|大家都|听说|书上)/, articleId: 'Section0205' },
  { pattern: /(弱|竞争|对手|资源少|打不过|强势|劣势|小)/, articleId: 'Section0211' }
]

function fallbackRecommendation(
  data: SessionData,
  mainContradiction: string
): ArticleRecommendation {
  const haystack = [
    data.problem.text,
    data.problem.background,
    data.problem.tried,
    mainContradiction,
    ...(data.diagnosis?.symptoms ?? [])
  ].join(' ')
  const hit = FALLBACK_RULES.find((r) => r.pattern.test(haystack))
  const core =
    (hit ? CORE_BY_ID.get(hit.articleId) : undefined) ??
    (CORE_ARTICLES[0] as (typeof CORE_ARTICLES)[number])
  return {
    articleId: core.articleId,
    title: core.title,
    reason: `你的描述里出现了“${core.solves}”这类信号，先用《${core.title}》对一对。`,
    focusQuestion: `带着这个问题去读：这篇文章怎么看我现在这个局面？我的第一步该干什么？`
  }
}

function normalizeDiagnosis(
  raw: Partial<Diagnosis>,
  data: SessionData,
  fallbackRecommendations: ArticleRecommendation[] = []
): Diagnosis {
  const restated = asString(raw?.restated)
  const symptoms = asStringArray(raw?.symptoms, 6)
  const mainContradiction = asString(raw?.mainContradiction)
  const stage = asString(raw?.stage)

  const list = Array.isArray(raw?.recommendations) ? raw.recommendations : []
  const seen = new Set<string>()
  const recommendations: ArticleRecommendation[] = []
  for (const item of list) {
    const obj = (item ?? {}) as { articleId?: unknown; reason?: unknown; focusQuestion?: unknown }
    const id = asString(obj.articleId)
    const core = CORE_BY_ID.get(id)
    if (!core || seen.has(id)) continue
    seen.add(id)
    recommendations.push({
      articleId: core.articleId,
      title: core.title, // 标题一律用 CORE 表回填，避免模型写错
      reason: asString(obj.reason),
      focusQuestion: asString(obj.focusQuestion)
    })
    if (recommendations.length >= 3) break
  }
  if (!recommendations.length) {
    // 修订场景优先沿用旧诊断的推荐，只有旧诊断也没有时才用兜底规则
    const inherited = fallbackRecommendations
      .filter((r) => r && CORE_BY_ID.has(r.articleId))
      .slice(0, 3)
    if (inherited.length) recommendations.push(...inherited.map((r) => ({ ...r })))
    else recommendations.push(fallbackRecommendation(data, mainContradiction))
  }

  return { restated, symptoms, mainContradiction, stage, recommendations }
}

export async function diagnose(s: Settings, data: SessionData): Promise<Diagnosis> {
  ensureKey(s)
  const raw = await callJson<Partial<Diagnosis>>(s, DIAGNOSE_SYSTEM, buildDiagnoseUser(data))
  return normalizeDiagnosis(raw ?? {}, data)
}

function normalizeProblem(raw: unknown, fallback: ProblemInput): ProblemInput {
  const obj = (raw ?? {}) as { text?: unknown; background?: unknown; tried?: unknown }
  return {
    text: asString(obj.text) || fallback.text,
    background: asString(obj.background) || fallback.background,
    tried: asString(obj.tried) || fallback.tried
  }
}

/** 根据右侧讨论重写第一步；只返回建议，写库由用户确认后通过 reading.apply 命令完成。 */
export async function reviseProblem(
  s: Settings,
  data: SessionData,
  chat: ChatMessage[]
): Promise<ProblemRevision> {
  ensureKey(s)

  const usable = chat.filter(
    (m) =>
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0
  )
  if (!usable.some((m) => m.role === 'user')) {
    throw new Error('右侧还没有和教练讨论，先聊一聊你的不同看法')
  }

  const raw = await callJson<{ problem?: unknown; diagnosis?: unknown; changes?: unknown }>(
    s,
    REVISE_PROBLEM_SYSTEM,
    buildReviseProblemUser(data, usable)
  )

  const oldDiagnosis = data.diagnosis
  const rawDiagnosis = raw?.diagnosis
  const diagnosis =
    rawDiagnosis && typeof rawDiagnosis === 'object'
      ? normalizeDiagnosis(
          rawDiagnosis as Partial<Diagnosis>,
          data,
          oldDiagnosis?.recommendations ?? []
        )
      : (oldDiagnosis ?? normalizeDiagnosis({}, data))

  const problem = normalizeProblem(raw?.problem, data.problem)
  let changes = asStringArray(raw?.changes, 10)
  if (!changes.length) {
    const before: Record<string, unknown> = { ...data.problem, ...(oldDiagnosis ?? {}) }
    const after: Record<string, unknown> = { ...problem, ...diagnosis }
    const labels: Record<string, string> = {
      text: '问题',
      background: '背景',
      tried: '已经试过',
      restated: '复述',
      symptoms: '症状',
      mainContradiction: '主要矛盾',
      stage: '所处阶段',
      recommendations: '推荐篇目'
    }
    changes = Object.keys(labels)
      .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
      .map((k) => `${labels[k]}：已根据讨论修订，请看下方对比`)
  }

  return { problem, diagnosis, changes }
}

/* ------------------------------ 第二步：聚焦核心 ------------------------------ */

function extractKeywords(data: SessionData): string[] {
  const texts = [
    data.problem.text,
    data.problem.background,
    data.problem.tried,
    data.diagnosis?.restated ?? '',
    data.diagnosis?.mainContradiction ?? '',
    data.diagnosis?.stage ?? '',
    ...(data.diagnosis?.symptoms ?? [])
  ]
  const set = new Set<string>()
  for (const text of texts) {
    const runs = (text ?? '').match(/[\u4e00-\u9fa5]{2,}/g) ?? []
    for (const run of runs) {
      const maxLen = Math.min(4, run.length)
      for (let len = 2; len <= maxLen; len++) {
        for (let i = 0; i + len <= run.length; i++) set.add(run.slice(i, i + len))
      }
    }
  }
  // 长词优先，丢掉被长词包含的短词，降低“问题”“现在”这类噪声
  const sorted = [...set].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const kept: string[] = []
  for (const keyword of sorted) {
    if (kept.some((k) => k.includes(keyword))) continue
    kept.push(keyword)
    if (kept.length >= 200) break
  }
  return kept
}

function filterParagraphsForPrompt(data: SessionData, article: Article): string[] {
  const paragraphs = article.paragraphs
  const lines = paragraphs.map((p, i) => `[${i}] ${p}`)
  const total = lines.reduce((n, line) => n + line.length + 1, 0)
  if (total <= FULLTEXT_LIMIT) return lines

  const keywords = extractKeywords(data)
  const scored = lines.map((line, index) => {
    const text = paragraphs[index] ?? ''
    // 短段落通常是章节标题，必留
    let score = text.length < 30 ? 2 : 0
    for (const kw of keywords) {
      if (text.includes(kw)) score += kw.length
    }
    return { index, score, line }
  })
  scored.sort((a, b) => b.score - a.score || a.index - b.index)

  const picked: number[] = []
  let budget = MAX_PROMPT_CHARS
  for (const item of scored) {
    const cost = item.line.length + 1
    if (cost > budget) continue
    budget -= cost
    picked.push(item.index)
    if (budget <= 0) break
  }
  picked.sort((a, b) => a - b)
  return picked.map((i) => lines[i] ?? '').filter(Boolean)
}

function verifyPassage(article: Article, raw: unknown): Passage | null {
  const paragraphs = article.paragraphs
  if (!paragraphs.length) return null

  const obj = (raw ?? {}) as { paragraphIndex?: unknown; quote?: unknown; why?: unknown }
  const quote = asString(obj.quote)
  if (!quote) return null
  const why = asString(obj.why)

  const rawIndex = Number(obj.paragraphIndex)
  let index =
    Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < paragraphs.length ? rawIndex : -1

  if (index >= 0 && (paragraphs[index] ?? '').includes(quote)) {
    return { paragraphIndex: index, quote, why, verified: true }
  }
  const found = paragraphs.findIndex((p) => p.includes(quote))
  if (found >= 0) {
    return { paragraphIndex: found, quote, why, verified: true }
  }
  // 原文里找不到这句：退回目标段落前 80 字，并标记未通过校验
  if (index < 0) index = 0
  return null
}

export async function findPassages(
  s: Settings,
  data: SessionData,
  article: Article
): Promise<{ focusQuestion: string; passages: Passage[] }> {
  ensureKey(s)
  if (!article || !article.paragraphs || !article.paragraphs.length) {
    throw new Error('这篇文章没有可用的原文内容')
  }

  const numbered = filterParagraphsForPrompt(data, article).join('\n')
  const raw = await callJson<{ focusQuestion?: unknown; passages?: unknown }>(
    s,
    FIND_PASSAGES_SYSTEM,
    buildFindPassagesUser(data, article.title, numbered)
  )

  const focusQuestion = asString(raw?.focusQuestion)
  const list = Array.isArray(raw?.passages) ? raw.passages : []
  const passages: Passage[] = []
  const used = new Set<number>()
  for (const item of list.slice(0, 8)) {
    const passage = verifyPassage(article, item)
    if (!passage || used.has(passage.paragraphIndex)) continue
    used.add(passage.paragraphIndex)
    passages.push(passage)
    if (passages.length >= 6) break
  }
  passages.sort((a, b) => a.paragraphIndex - b.paragraphIndex)

  return { focusQuestion, passages }
}

/* ------------------------------ 第三步：联系自身 ------------------------------ */

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(5, Math.round(n)))
}

function passagesOf(data: SessionData, articleId: string): Passage[] {
  const reading = data.readings.find((r) => r.articleId === articleId)
  return reading?.passages ?? []
}

function reflectionsOf(data: SessionData, articleId: string) {
  const reading = data.readings.find((r) => r.articleId === articleId)
  return reading?.reflections ?? []
}

export async function reviewNotes(
  s: Settings,
  data: SessionData,
  article: Article,
  notes: ThreeNotes
): Promise<NoteFeedback> {
  ensureKey(s)

  const marked = passagesOf(data, article.id)
  const reflections = reflectionsOf(data, article.id)
  const raw = await callJson<{
    scores?: unknown
    comments?: unknown
    rereadParagraphs?: unknown
  }>(s, REVIEW_NOTES_SYSTEM, buildReviewNotesUser(data, article.title, marked, notes, reflections))

  const scoresRaw = (raw?.scores ?? {}) as Record<string, unknown>
  const scores = {
    coreMethod: clampScore(scoresRaw.coreMethod),
    relatedProblem: clampScore(scoresRaw.relatedProblem),
    action: clampScore(scoresRaw.action)
  }
  const passed = scores.coreMethod >= 3 && scores.relatedProblem >= 3 && scores.action >= 3
  const comments = asStringArray(raw?.comments, 6)

  const maxIndex = Math.max(0, (article.paragraphs?.length ?? 1) - 1)
  const rawReread = Array.isArray(raw?.rereadParagraphs) ? raw.rereadParagraphs : []
  const filtered = rawReread
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= maxIndex)
  let rereadParagraphs = [...new Set(filtered)].sort((a, b) => a - b)

  // 不及格却没给段落时，退回他自己标注过的段落，保证界面上有东西可点
  if (!passed && !rereadParagraphs.length && marked.length) {
    rereadParagraphs = marked.map((p) => p.paragraphIndex).slice(0, 3)
  }

  return { passed, scores, comments, rereadParagraphs }
}

/* ------------------------------ 第四步：反复应用 ------------------------------ */

export async function reviewSituation(
  s: Settings,
  data: SessionData,
  newSituation: string,
  articleTitles: Map<string, string>
): Promise<Review> {
  ensureKey(s)

  const catalog = [...articleTitles.entries()].map(([id, title]) => `${id}｜${title}`).join('\n')
  const raw = await callJson<{ rereadArticleIds?: unknown; advice?: unknown }>(
    s,
    REVIEW_SITUATION_SYSTEM,
    buildReviewSituationUser(data, newSituation, catalog)
  )

  const rawIds = Array.isArray(raw?.rereadArticleIds) ? raw.rereadArticleIds : []
  const rereadArticleIds: string[] = []
  for (const v of rawIds) {
    const id = asString(v)
    if (!id || rereadArticleIds.includes(id)) continue
    if (!articleTitles.has(id)) continue // 只保留文章库里真实存在的 id
    rereadArticleIds.push(id)
    if (rereadArticleIds.length >= 3) break
  }

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    newSituation,
    rereadArticleIds,
    advice: asString(raw?.advice)
  }
}

export async function mindset(s: Settings, data: SessionData): Promise<Mindset> {
  ensureKey(s)
  const raw = await callJson<{ mainContradiction?: unknown; stage?: unknown; firstStep?: unknown }>(
    s,
    MINDSET_SYSTEM,
    buildMindsetUser(data)
  )
  return {
    mainContradiction: asString(raw?.mainContradiction),
    stage: asString(raw?.stage),
    firstStep: asString(raw?.firstStep),
    generatedAt: new Date().toISOString()
  }
}

/* ------------------------------ 陪读对话 ------------------------------ */

export function buildChatMessages(
  data: SessionData,
  history: ChatMessage[],
  userContent: string,
  article: Article | null
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: 'system', content: buildChatSystem(data, article) }]

  for (const m of history.slice(-20)) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    if (!m.content || !m.content.trim()) continue
    messages.push({ role: m.role, content: m.content })
  }

  messages.push({ role: 'user', content: userContent })
  return messages
}
