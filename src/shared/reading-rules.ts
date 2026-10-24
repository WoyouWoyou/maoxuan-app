import type { SessionData, StepKey } from './types'
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
      if (!data.readings.some((r) => r.readDone)) {
        return { ok: false, reason: '先精读一篇文章，点“我读完了”' }
      }
      return { ok: true, reason: '' }
    case 'apply':
      if (!data.readings.some((r) => r.notesDone)) {
        return { ok: false, reason: '先写完 3 条笔记并保存，才会生成行动' }
      }
      return { ok: true, reason: '' }
    default:
      return { ok: false, reason: '' }
  }
}

export function stepDone(data: SessionData, step: StepKey): boolean {
  switch (step) {
    case 'problem':
      return data.diagnosis !== null
    case 'focus':
      return data.readings.some((r) => r.readDone)
    case 'relate':
      return data.readings.some((r) => r.notesDone)
    case 'apply':
      return data.mindset !== null || data.actions.some((a) => a.status === 'done')
    default:
      return false
  }
}
