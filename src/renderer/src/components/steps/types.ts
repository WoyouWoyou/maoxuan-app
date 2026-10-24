import type { Session, SessionData, StepKey } from '@shared/types'

export interface StepProps {
  session: Session
  /** 保存 data；给 versionLabel 则记录版本；给 step 则同时切换 currentStep */
  save: (data: SessionData, opts?: { versionLabel?: string; step?: StepKey }) => Promise<void>
  /** 基于“最新的”会话数据计算结果再保存：耗时操作（AI 调用等）返回后写回，不会覆盖期间的其他改动 */
  update: (
    fn: (latest: SessionData) => SessionData,
    opts?: { versionLabel?: string; step?: StepKey }
  ) => Promise<void>
  goStep: (step: StepKey) => void
  /** 打开阅读器：切到第二步、选中文章、滚动到段落 */
  openReader: (articleId: string, paragraph?: number) => void
  focusArticleId: string | null
  setFocusArticleId: (id: string | null) => void
  scrollToParagraph: number | null
  /** 打开“套用讨论结果”弹窗（第一步） */
  openRevise: () => void
}

export { stepUnlocked, stepDone } from '@shared/reading-rules'
