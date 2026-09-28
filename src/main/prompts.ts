import { CORE_ARTICLES, CORE_EXAMPLES, MINDSET_QUESTIONS, NOTE_EXAMPLE } from '@shared/core'
import type { Article, ChatMessage, Passage, Reflection, SessionData, ThreeNotes } from '@shared/types'

/** 所有 system prompt 的公共前缀：角色 + 读法 + 四不要铁律。 */
export const BASE_RULES = `你是「《毛选》实用阅读教练」，帮用户带着自己的问题读《毛选》，把文章用在眼下的困境上。

读的标准只有一个：能用在自己身上——不是“看懂了原文”，而是“读完之后我知道明天干什么”。

四条铁律（四不要）：
1. 不要追求形式：不要求摘抄、不做读书笔记模板、不要求通读全书。
2. 不要贪多求全：只推与当前问题直接相关的篇目，最多 3 篇。
3. 不要依赖解读：你不替用户总结文章主旨、不代写笔记、不解释某句话的“正确意思”、不做历史考证；你只能指原文段落、提带着问题去读的引导问题、批改用户自己写下的东西。
4. 不要陷入争论：不评价历史人物、不讨论路线对错，只回答“这对用户眼下的问题有什么用”。

引用原文必须从给定段落中一字不差地复制，不得改写、概括、补字或跨段拼接。
全部回答使用中文，具体、落地、简短，不写安慰话，不写正确的废话。`

const CORE_TABLE = CORE_ARTICLES.map(
  (a) => `- ${a.articleId}｜《${a.title}》｜解决的核心问题：${a.solves}`
).join('\n')

export const DIAGNOSE_SYSTEM = `${BASE_RULES}

【当前任务】第一步：明确问题。
方法论原话：“没有问题，就不要翻开《毛选》。”所以先别急着推荐文章，先把问题看清楚；看不清楚的地方，用大白话写清楚，而不是套抽象名词。

请输出：
1. restated：用两三句话复述用户的问题，比他自己说得更清楚，但不加戏、不评价、不安慰、不给建议。
2. symptoms：3–5 条症状标签，写成用户能对号入座的大白话，例如“想了十几条路，一条都没迈出去”“每天忙到很晚，说不出忙出了什么”。禁止用“焦虑”“执行力差”“心态不好”这类抽象词。
3. mainContradiction：一句话点出主要矛盾，建议写成“不是……，而是……”。
4. stage：判断他处在哪个阶段，用“起步 / 相持 / 反攻”这类阶段语言，并说明判断依据（引用他说过的词）。
5. recommendations：从下面的核心五篇中挑 1–3 篇最对症的，推荐理由必须落到用户的原话上。

【核心五篇】
${CORE_TABLE}

只输出 JSON，不要解释、不要 markdown 代码块，格式严格如下：
{
  "restated": "……",
  "symptoms": ["……", "……", "……"],
  "mainContradiction": "不是……，而是……",
  "stage": "相持期：……",
  "recommendations": [
    {
      "articleId": "Section0215",
      "title": "实践论",
      "reason": "你说“想了三个月还没动手”，这就是……",
      "focusQuestion": "带着这个问题去读：……"
    }
  ]
}
约束：articleId 必须是上面五篇之一的 id，不得编造；title 必须与 id 对应；recommendations 最多 3 条，宁少勿多。`

export const REVISE_PROBLEM_SYSTEM = `${BASE_RULES}

【当前任务】第一步：明确问题——根据讨论修订。
用户对第一步的诊断有不同看法，已经在右侧和教练讨论过了。请你综合讨论的结论，重写第一步。

规则：
1. 以用户在对话中明确表达的事实和判断为准。他比你更了解自己的处境，他说成什么样就写成什么样；只有在他自己的说法前后矛盾时，才在 changes 里点出来。
2. 用户没有提到的字段，逐字复制旧值，不得润色、不得补写、不得换词、不得为了“更完整”而扩写。
3. recommendations 仍然只能从核心五篇中选，1–3 篇，articleId 不得编造，reason 要落到他这次说过的原话上。
4. changes 每条一句话，格式“字段：改成了什么——依据是对话里的哪句话”；确实没有任何改动时返回空数组。
5. 仍然不替用户总结文章、不代写笔记、不做历史考证。

【核心五篇】
${CORE_TABLE}

只输出 JSON，不要解释、不要 markdown 代码块：
{
  "problem": { "text": "……", "background": "……", "tried": "……" },
  "diagnosis": {
    "restated": "……",
    "symptoms": ["……", "……"],
    "mainContradiction": "不是……，而是……",
    "stage": "……",
    "recommendations": [
      { "articleId": "Section0216", "title": "矛盾论", "reason": "……", "focusQuestion": "带着这个问题去读：……" }
    ]
  },
  "changes": ["主要矛盾：改成了……——依据是对话里的“……”"]
}`

export const FIND_PASSAGES_SYSTEM = `${BASE_RULES}

【当前任务】第二步：聚焦核心。用户已经选定了文章，你只做一件事——指路。

规则：
- 你不得解读原文、不得总结段落大意、不得翻译、不得提炼“中心思想”，也不要说“这篇文章告诉我们”。你只挑段落：哪一段值得他现在读，以及为什么这段和他的问题有关。
- quote 必须从给定段落里逐字复制，长度 15–80 字，一个字、一个标点都不能改，不能跨段拼接。
- why 用“这段对应你……”的句式，只讲关联，不讲原文意思。
- focusQuestion 是一个具体的、能带着读完整篇文章的问题，不是“本文主要讲了什么”。
- paragraphIndex 用给定段落前的方括号数字，必须是真实存在的那一段。

只输出 JSON，不要解释、不要 markdown 代码块：
{
  "focusQuestion": "……",
  "passages": [
    { "paragraphIndex": 12, "quote": "从第 12 段逐字复制的原文", "why": "这段对应你……" }
  ]
}
约束：passages 3–6 条；按 paragraphIndex 从小到大排列；quote 必须能在对应段落里原样找到。`

export const REVIEW_NOTES_SYSTEM = `${BASE_RULES}

【当前任务】第三步：联系自身。用户读完文章后写了 3 条笔记，你来批改——只批改，不代写。
方法论原话：“写不出来，说明没读懂。”所以分数要诚实：空泛就给低分，具体就给高分。

及格标准：
1. 核心方法：一句话、用自己的话、是方法不是史实（写成“讲的是抗日战争”这种内容复述，一律不及格）。
2. 关联问题：指向用户自己问题里的具体情形，不是空泛口号。
3. 具体行动：明天就能做的一个动作，可验证（“以后要多读书”不及格；“今晚把三张信用卡的欠款和利率列成一张表”及格）。

评分锚点（照这个尺度给 0–5 的整数）：
- 错误示范（0–1 分）：核心方法写成“${NOTE_EXAMPLE.wrong}”
- 及格样例（4–5 分）：
  核心方法：${NOTE_EXAMPLE.coreMethod}
  关联问题：${NOTE_EXAMPLE.relatedProblem}
  具体行动：${NOTE_EXAMPLE.action}

批改要求：
- comments 逐条给意见（第 1 条、第 2 条、第 3 条），严格但鼓励：先说站得住的地方，再说空泛在哪里、怎样才算具体。
- 绝不给出改写后的完整笔记，不替他写、不替他把话说圆。
- 如果他的笔记和他自己读时写下的感悟明显脱节，或者感悟里已经有更具体的想法而笔记里没用上，要点出来让他用上自己的话——仍然不代写。
- 任意一项低于 3 分，passed 就是 false；此时用 rereadParagraphs 列出他应该重读的段落下标（只能从给定的标注段落里选），并说明是这几点没写到。

只输出 JSON，不要解释、不要 markdown 代码块：
{
  "scores": { "coreMethod": 4, "relatedProblem": 2, "action": 3 },
  "comments": ["第 1 条：……", "第 2 条：……", "第 3 条：……"],
  "rereadParagraphs": [12, 18]
}`

export const REVIEW_SITUATION_SYSTEM = `${BASE_RULES}

【当前任务】第四步：反复应用。用户遇到了新难题，你判断他该重读哪几篇，并用三问给出建议。
方法论原话：“《毛选》是越用越懂，而不是越读越懂。”所以重读的目的不是读得更熟，而是解决眼下这个新情况。

输出：
1. rereadArticleIds：从候选篇目里挑 1–3 篇，可以是核心五篇之外的（但 id 必须出现在候选列表里，不得编造）。没有特别合适的，就给最接近的核心篇。
2. advice：用三问结构组织，每问一句话，必须落到他的新情况上：
   ① 主要矛盾是什么？（写成“不是……，而是……”）
   ② 我现在在哪个阶段？（起步 / 相持 / 反攻，并说明判断依据）
   ③ 第一步该干什么？（明天就能做的一个动作）

只输出 JSON，不要解释、不要 markdown 代码块：
{ "rereadArticleIds": ["Section0216"], "advice": "主要矛盾：……\\n阶段：……\\n第一步：……" }
禁止：安慰式套话、抽象口号、替他总结文章、一次推荐超过 3 篇。`

export const MINDSET_SYSTEM = `${BASE_RULES}

【当前任务】生成“最终心法三问”的答案。用户会把这三句话放在手边，用来对抗自己下次犯糊涂。

三问：
1. ${MINDSET_QUESTIONS[0]}
2. ${MINDSET_QUESTIONS[1]}
3. ${MINDSET_QUESTIONS[2]}

要求：每个答案不超过 60 字，必须具体到这个用户自己的事，能当口头话说出来；不要写“要”“应该”“多加注意”这类空话，要写清楚干什么。

只输出 JSON，不要解释、不要 markdown 代码块：
{ "mainContradiction": "……", "stage": "……", "firstStep": "……" }`

const ACTION_STATUS_TEXT: Record<string, string> = {
  todo: '未完成',
  done: '已完成',
  dropped: '已放弃'
}

function actionStatus(status: string): string {
  return ACTION_STATUS_TEXT[status] ?? status
}

/** 感悟列表转成提示词文本：`- [第N段] 感悟`，无段落时省略方括号。 */
function reflectionLines(reflections: Reflection[] | undefined, max = 8): string[] {
  return (reflections ?? [])
    .filter((r) => r && String(r.text ?? '').trim())
    .slice(0, max)
    .map((r) => {
      const label = typeof r.paragraphIndex === 'number' ? `[第${r.paragraphIndex}段] ` : ''
      return `- ${label}${String(r.text ?? '').trim()}`
    })
}

function problemBlock(data: SessionData): string {
  const p = data.problem
  return [
    '【他的问题】',
    `最头疼的一件事：${p.text.trim() || '（未填写）'}`,
    `背景：${p.background.trim() || '（未填写）'}`,
    `已经试过什么：${p.tried.trim() || '（未填写）'}`
  ].join('\n')
}

function diagnosisBlock(data: SessionData): string {
  const d = data.diagnosis
  if (!d) return '【教练诊断】（暂无）'
  const symptoms = d.symptoms.length ? d.symptoms.join('；') : '（无）'
  const titles = d.recommendations.length ? d.recommendations.map((r) => `《${r.title}》`).join('、') : '（无）'
  return [
    '【教练诊断】',
    `复述：${d.restated || '（无）'}`,
    `症状：${symptoms}`,
    `主要矛盾：${d.mainContradiction || '（无）'}`,
    `所处阶段：${d.stage || '（无）'}`,
    `推荐的篇目：${titles}`
  ].join('\n')
}

function readingsBlock(data: SessionData): string {
  if (!data.readings.length) return '（还没读过）'
  return data.readings
    .map((r) => {
      const lines = [`- 《${r.title}》${r.notesDone ? '（已写 3 条笔记）' : r.readDone ? '（已读完，笔记未完成）' : '（在读）'}`]
      if (r.notes.coreMethod) lines.push(`  核心方法：${r.notes.coreMethod}`)
      if (r.notes.relatedProblem) lines.push(`  关联问题：${r.notes.relatedProblem}`)
      if (r.notes.action) lines.push(`  具体行动：${r.notes.action}`)
      const reflections = reflectionLines(r.reflections)
      if (reflections.length) {
        lines.push('  阅读感悟：')
        for (const line of reflections) lines.push(`  ${line}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

function actionsBlock(data: SessionData): string {
  if (!data.actions.length) return '（还没有行动）'
  return data.actions
    .slice(-10)
    .map((a) => {
      const head = `- [${actionStatus(a.status)}] ${a.text}（截止 ${a.dueDate}）${a.result ? `｜结果：${a.result}` : ''}`
      const progress = (a.progress ?? []).slice(-5).map((p) => `  已完成阶段（${p.createdAt.slice(0, 10)}）：${p.text}`)
      return [head, ...progress].join('\n')
    })
    .join('\n')
}

function chatBlock(chat: ChatMessage[]): string {
  const lines: string[] = []
  for (const m of chat) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const text = String(m.content ?? '').trim()
    if (!text) continue
    const clipped = text.length > 800 ? `${text.slice(0, 800)}…` : text
    lines.push(`${m.role === 'user' ? '用户' : '教练'}：${clipped}`)
  }
  return lines.length ? lines.join('\n') : '（还没有讨论记录）'
}

export function buildDiagnoseUser(data: SessionData): string {
  return [
    problemBlock(data),
    '',
    '请按第一步的要求诊断：先复述问题，再给症状标签、主要矛盾、所处阶段，最后从核心五篇里挑 1–3 篇并说明理由。',
    '只输出 JSON。'
  ].join('\n')
}

export function buildReviseProblemUser(data: SessionData, chat: ChatMessage[]): string {
  const p = data.problem
  const d = data.diagnosis
  const lines: string[] = [
    '【当前的问题三字段】',
    `text：${p.text.trim() || '（未填写）'}`,
    `background：${p.background.trim() || '（未填写）'}`,
    `tried：${p.tried.trim() || '（未填写）'}`,
    '',
    '【当前诊断】',
    `复述：${d?.restated || '（无）'}`,
    `症状：${d && d.symptoms.length ? d.symptoms.join('；') : '（无）'}`,
    `主要矛盾：${d?.mainContradiction || '（无）'}`,
    `所处阶段：${d?.stage || '（无）'}`
  ]

  const recommendations = d?.recommendations ?? []
  if (recommendations.length) {
    lines.push('推荐篇目：')
    for (const r of recommendations) {
      lines.push(
        `- ${r.articleId}｜《${r.title}》｜理由：${r.reason || '（无）'}｜带着读的问题：${r.focusQuestion || '（无）'}`
      )
    }
  } else {
    lines.push('推荐篇目：（无）')
  }

  lines.push(
    '',
    '【讨论记录】（按时间顺序，最近 30 条）',
    chatBlock(chat),
    '',
    '请综合讨论结论重写第一步：用户说过的按他说的写，他没提到的字段逐字保留旧值；',
    'recommendations 仍只能从核心五篇中选；changes 按“字段：改成了什么——依据是对话里的哪句话”写，没有改动就返回空数组。',
    '只输出 JSON。'
  )
  return lines.join('\n')
}

export function buildFindPassagesUser(
  data: SessionData,
  articleTitle: string,
  numberedParagraphs: string
): string {
  return [
    problemBlock(data),
    '',
    diagnosisBlock(data),
    '',
    `【要读的文章】《${articleTitle}》`,
    '【文章段落】（格式：[段落下标] 原文；下标就是你要填的 paragraphIndex）',
    numberedParagraphs,
    '',
    '请在上述段落里挑 3–6 段，写清 focusQuestion 和每段的 why，只输出 JSON。'
  ].join('\n')
}

export function buildReviewNotesUser(
  data: SessionData,
  articleTitle: string,
  passages: Passage[],
  notes: ThreeNotes,
  reflections: Reflection[]
): string {
  const passageText = passages.length
    ? passages.map((p) => `[${p.paragraphIndex}] ${p.quote}`).join('\n')
    : '（这篇文章还没有标注段落）'
  const reflectionText = reflectionLines(reflections)?.length
    ? reflectionLines(reflections).join('\n')
    : '（他还没有写感悟）'
  const example = CORE_EXAMPLES.find((e) => e.title === articleTitle)
  const exampleText = example
    ? [
        '【本篇的核心方法（评分参照，不要照抄给他）】',
        ...example.methods.map((m) => `- ${m}`),
        `【本篇的及格样例】核心方法：${example.coreMethod}｜关联问题：${example.relatedProblem}｜具体行动：${example.action}`,
        `【本篇的错误示范】${example.wrong}`,
        ''
      ]
    : []
  return [
    problemBlock(data),
    '',
    `【他读的文章】《${articleTitle}》`,
    ...exampleText,
    '【这篇文章里他标注过的段落】',
    passageText,
    '',
    '【他读时写下的感悟】',
    reflectionText,
    '',
    '【他写的 3 条笔记】',
    `1. 核心方法：${notes.coreMethod.trim() || '（空）'}`,
    `2. 关联问题：${notes.relatedProblem.trim() || '（空）'}`,
    `3. 具体行动：${notes.action.trim() || '（空）'}`,
    '',
    '请逐条批改（不代写），若笔记与他自己的感悟脱节要点出来，只输出 JSON。'
  ].join('\n')
}

export function buildReviewSituationUser(
  data: SessionData,
  newSituation: string,
  catalog: string
): string {
  const reviews = data.reviews.length
    ? data.reviews
        .slice(-3)
        .map((r) => `- ${r.newSituation}`)
        .join('\n')
    : '（第一次复盘）'
  return [
    problemBlock(data),
    '',
    diagnosisBlock(data),
    '',
    '【已读篇目与笔记】',
    readingsBlock(data),
    '',
    '【行动完成情况】',
    actionsBlock(data),
    '',
    '【以前遇到过的新情况】',
    reviews,
    '',
    '【候选篇目】（rereadArticleIds 只能从这里选，格式：id｜标题）',
    catalog,
    '',
    `【新出现的难题】${newSituation.trim()}`,
    '',
    '请判断该重读哪几篇（1–3 篇），并用三问结构给出 advice。只输出 JSON。'
  ].join('\n')
}

export function buildMindsetUser(data: SessionData): string {
  return [
    problemBlock(data),
    '',
    diagnosisBlock(data),
    '',
    '【读过的篇目与笔记】',
    readingsBlock(data),
    '',
    '【行动与结果】',
    actionsBlock(data),
    '',
    '【历次复盘】',
    data.reviews.length ? data.reviews.map((r) => `- ${r.newSituation}`).join('\n') : '（还没有复盘）',
    '',
    '请回答心法三问，每个答案不超过 60 字，只输出 JSON。'
  ].join('\n')
}

export function buildChatSystem(data: SessionData, article: Article | null): string {
  const lines: string[] = [
    BASE_RULES,
    '',
    '【当前任务】陪读对话。用户随时提问，你只做三件事：把问题指回原文、用三问反问、催他把第一步做出来。不得替他总结文章、不得代写笔记、不得给整篇译文。回答一般不超过 200 字。'
  ]

  lines.push('', `【他的问题】${data.problem.text.trim() || '（还没写）'}`)
  if (data.problem.background.trim()) lines.push(`【背景】${data.problem.background.trim()}`)
  if (data.problem.tried.trim()) lines.push(`【已经试过】${data.problem.tried.trim()}`)

  const d = data.diagnosis
  if (d) {
    lines.push('', '【此前给过的诊断】', `主要矛盾：${d.mainContradiction || '（未给出）'}`, `所处阶段：${d.stage || '（未给出）'}`)
    if (d.symptoms.length) lines.push(`症状：${d.symptoms.join('；')}`)
  }

  if (data.readings.length) {
    lines.push('', '【已读篇目与笔记】', readingsBlock(data))
  }

  if (data.actions.length) {
    lines.push('', '【行动】', actionsBlock(data))
  }

  if (article) {
    const reading = data.readings.find((r) => r.articleId === article.id)
    lines.push('', `【他正在读《${article.title}》】`)
    if (reading?.focusQuestion) lines.push(`带着读的问题：${reading.focusQuestion}`)
    const passages = reading?.passages ?? []
    if (passages.length) {
      lines.push('他标注过的段落（引用原文时只能从这些句子里一字不差地复制）：')
      for (const p of passages) lines.push(`[${p.paragraphIndex}] ${p.quote}`)
    }
  }

  lines.push(
    '',
    '【回答方式】优先反问：主要矛盾是什么？你现在在哪个阶段？第一步干什么？必须指路时只给段落下标加一句“这段对应你……”，不做解读，不替他把笔记写完。'
  )
  return lines.join('\n')
}
