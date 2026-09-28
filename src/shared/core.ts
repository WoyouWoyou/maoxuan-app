export interface CoreArticle {
  order: number
  articleId: string
  title: string
  solves: string
}

export const CORE_ARTICLES: CoreArticle[] = [
  { order: 0, articleId: 'Section0215', title: '实践论', solves: '想得多、做得少，主观臆断' },
  { order: 1, articleId: 'Section0216', title: '矛盾论', solves: '局面一团乱麻，抓不住重点' },
  { order: 2, articleId: 'Section0309', title: '论持久战', solves: '急于求成，看不到希望，想放弃' },
  { order: 3, articleId: 'Section0205', title: '反对本本主义', solves: '照搬别人经验，不结合自身实际' },
  { order: 4, articleId: 'Section0211', title: '中国革命战争的战略问题', solves: '在竞争中处于弱势，如何以弱胜强' }
]

export const FOUR_DONTS: { title: string; detail: string }[] = [
  { title: '不要追求形式', detail: '无需精装收藏，电子版即可，关键在于使用。' },
  { title: '不要贪多求全', detail: '大部分篇目与你当下无关，等遇到类似局面再翻。' },
  { title: '不要依赖解读', detail: '别人嚼过的馍没味道。自己读原文，哪怕慢一点。' },
  { title: '不要陷入争论', detail: '不纠结某句话的“正确意思”，只关心它能不能帮你解决问题。' }
]

export const NOTE_FIELDS: { key: 'coreMethod' | 'relatedProblem' | 'action'; label: string; guide: string }[] = [
  { key: 'coreMethod', label: '1. 核心方法', guide: '用自己的话，一句话概括文章的核心方法。' },
  { key: 'relatedProblem', label: '2. 关联问题', guide: '这个方法能解决你当前的哪个具体问题？' },
  { key: 'action', label: '3. 具体行动', guide: '设计一个你明天就能做的具体动作。' }
]

export interface CoreExample {
  articleId: string
  title: string
  /** 该篇的核心方法罗列（尽量用原文说法）。 */
  methods: string[]
  wrong: string
  coreMethod: string
  relatedProblem: string
  action: string
}

export const CORE_EXAMPLES: CoreExample[] = [
  {
    articleId: 'Section0215',
    title: '实践论',
    methods: [
      '实践、认识、再实践、再认识，循环往复',
      '从感性认识上升到理性认识，再回到实践中去',
      '认识对不对，只能由实践来检验',
      '要知道梨子的滋味，就得亲口吃一吃'
    ],
    wrong: '讲的是认识论哲学。',
    coreMethod: '想法对不对，只有做一遍才知道；先小范围试，再根据结果调整。',
    relatedProblem: '我想转做产品经理，看了半年课程，却一个原型都没做过。',
    action: '明天花两小时，给身边一个真实的小需求画一版原型，发给两个人要反馈。'
  },
  {
    articleId: 'Section0216',
    title: '矛盾论',
    methods: [
      '抓主要矛盾：捉住了它，一切问题就迎刃而解',
      '具体问题具体分析，不同质的矛盾用不同质的方法解决',
      '分清矛盾的主要方面和次要方面',
      '矛盾在一定条件下会相互转化'
    ],
    wrong: '讲的是唯物辩证法。',
    coreMethod: '一团乱麻时，先找出那个解决了、其他就跟着松动的主要矛盾。',
    relatedProblem: '三个项目同时延期，我每个都救一点，结果哪个都没救成。',
    action: '明早列出三个项目的卡点，只挑决定客户续约的那个，把一整天都给它。'
  },
  {
    articleId: 'Section0309',
    title: '论持久战',
    methods: [
      '既反对速胜论，也反对亡国论',
      '持久战分三个阶段：防御、相持、反攻',
      '积小胜为大胜，在持久中求速决',
      '兵民是胜利之本：靠自己积累力量'
    ],
    wrong: '讲的是抗日战争。',
    coreMethod: '任何困难都不能指望一下子解决，得分阶段。',
    relatedProblem: '我负债 30 万，不能指望一年还清。',
    action: '第一阶段先停止以贷养贷，把所有债务理清楚。'
  },
  {
    articleId: 'Section0205',
    title: '反对本本主义',
    methods: [
      '没有调查，没有发言权',
      '调查就是解决问题',
      '不照搬本本，从自己的实际情况出发',
      '到实际中去，向做事的人请教'
    ],
    wrong: '讲的是不要读书。',
    coreMethod: '别人的成功经验只能参考，先调查清楚自己的实际情况再定办法。',
    relatedProblem: '我照着网上的爆款教程开店，选品、定价全照抄，三个月没起色。',
    action: '明天去问 5 个进店没买的顾客为什么没买，把原话记下来。'
  },
  {
    articleId: 'Section0211',
    title: '中国革命战争的战略问题',
    methods: [
      '先弄清自己所处局面的特点，再定打法',
      '弱势时实行积极防御，必要时战略退却',
      '集中优势兵力，各个歼灭敌人',
      '打得赢就打，打不赢就走；先打弱敌，建立根据地'
    ],
    wrong: '讲的是红军怎么打仗。',
    coreMethod: '处于弱势时不硬碰强者，把有限的力量集中到一个点上，先打一个胜仗。',
    relatedProblem: '新领导还不了解我，老资历同事占着资源，我到处出击却没人认可。',
    action: '明天挑一个没人愿做、但领导在意的小问题，写一页方案，本周内做出第一个结果。'
  }
]

/** 按文章取示例；非核心篇回退到《论持久战》。 */
export function exampleFor(articleId: string | null | undefined): CoreExample {
  return CORE_EXAMPLES.find((e) => e.articleId === articleId) ?? CORE_EXAMPLES[2]
}

const LONG_WAR = exampleFor('Section0309')

export const NOTE_EXAMPLE = {
  articleTitle: LONG_WAR.title,
  wrong: LONG_WAR.wrong,
  coreMethod: LONG_WAR.coreMethod,
  relatedProblem: LONG_WAR.relatedProblem,
  action: LONG_WAR.action
}

export const TRASH_RETENTION_DAYS = 30

export const MINDSET_QUESTIONS = ['主要矛盾是什么？', '我现在在哪个阶段？', '第一步该干什么？']

export const MOTTO = '拿出你最头疼的问题，找到对应的文章，读三步，写 3 条，干 1 件事。'
