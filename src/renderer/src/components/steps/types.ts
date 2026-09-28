import type { Session, SessionData, StepKey } from '@shared/types'

export interface StepProps {
  session: Session
  /** 保存 data；给 versionLabel 则记录版本；给 step 则同时切换 currentStep */
  save: (data: SessionData, opts?: { versionLabel?: string; step?: StepKey }) => Promise<void>
  /** 基于“最新的”会话数据计算结果再保存：耗时操作（AI 调用等）返回后写回，不会覆盖期间的其他改动 */
  update: (fn: (latest: SessionData) => SessionData, opts?: { versionLabel?: string; step?: StepKey }) => Promise<void>
  goStep: (step: StepKey) => void
  /** 打开阅读器：切到第二步、选中文章、滚动到段落 */
  openReader: (articleId: string, paragraph?: number) => void
  focusArticleId: string | null
  setFocusArticleId: (id: string | null) => void
  scrollToParagraph: number | null
  /** 打开“套用讨论结果”弹窗（第一步） */
  openRevise: () => void
}

/** 关键内容整理自 SPEC.md 第 1 节：没有满足门槛，就不要进入下一步。 */
export function stepUnlocked(data: SessionData, step: StepKey): { ok: boolean; reason: string } {
  switch (step) {
    case 'problem':
      return { ok: true, reason: '' }
    case 'focus':
      if (data.problem.text.trim().length < 10) {
        return { ok: false, reason: '先把最头疼的一件事写具体（至少 10 字）' }
      }
      if (!data.diagnosis) {
        return { ok: false, reason: '先请教练诊断，确认问题再读原文' }
      }
      return { ok: true, reason: '' }
    case 'relate':
      if (!data.readings.some(r => r.readDone)) {
        return { ok: false, reason: '先精读一篇文章，点“我读完了”' }
      }
      return { ok: true, reason: '' }
    case 'apply':
      if (!data.readings.some(r => r.notesDone)) {
        return { ok: false, reason: '先写完 3 条笔记并保存，才会生成行动' }
      }
      return { ok: true, reason: '' }
  }
}

export function stepDone(data: SessionData, step: StepKey): boolean {
  switch (step) {
    case 'problem':
      return data.diagnosis !== null
    case 'focus':
      return data.readings.some(r => r.readDone)
    case 'relate':
      return data.readings.some(r => r.notesDone)
    case 'apply':
      return data.mindset !== null || data.actions.some(a => a.status === 'done')
  }
}
