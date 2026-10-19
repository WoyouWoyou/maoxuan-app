import type { SessionData } from './types'
export function readingPresentation(data: SessionData) {
  const generic = data.book?.profile === 'generic'
  return {
    generic,
    obstacle: generic ? '当前关键障碍' : '主要矛盾',
    constraints: generic ? '约束与待确认信息' : '所处阶段',
    hints: generic
      ? [
          '先把想解决的问题写清楚',
          '选相关章节，读原文并写感受',
          '写下理解、联系和准备尝试的事',
          '记录实际结果，再调整下一步'
        ]
      : null,
    questions: generic
      ? ['我现在卡在哪里？', '哪些判断还需要验证？', '下一项具体尝试是什么？']
      : null,
    intro: generic
      ? {
          title: `一起带着问题读《${data.book?.title}》。`,
          desc: '我帮你找原文、提出问题和反馈；感受、判断和行动由你自己写。'
        }
      : undefined,
    fields: [
      {
        key: 'coreMethod' as const,
        label: generic ? '1. 我从原文读到了什么' : '1. 核心方法',
        guide: generic ? '用自己的话写，并指出依据和局限' : '说清原文中可用的方法'
      },
      { key: 'relatedProblem' as const, label: '2. 和我有什么关系', guide: '对应自己的真实处境' },
      { key: 'action' as const, label: '3. 准备尝试什么', guide: '写一个能执行和验证的小行动' }
    ]
  }
}
