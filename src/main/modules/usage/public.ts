import type { CallContext, TokenUsage, UsageQuery, UsageStats } from '@shared/contracts/usage'
export interface UsageRepository {
  beginCall(id: string, ctx: CallContext, model: string, endpoint: string): void
  finishCall(id: string, status: string, usage: TokenUsage, duration: number): void
  queryUsage(query?: UsageQuery): UsageStats
  recover(): void
}
let repository: UsageRepository
export function configureUsage(value: UsageRepository): void {
  repository = value
  repository.recover()
}
const pending: (() => void)[] = []
let retryTimer: ReturnType<typeof setTimeout> | undefined
function flush(): void {
  while (pending.length) {
    try {
      pending[0]()
      pending.shift()
    } catch {
      console.warn('AI 用量落库暂时失败，正在重试；统计暂不完整')
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          flush()
        }, 1000)
        retryTimer.unref()
      }
      return
    }
  }
}
function enqueue(write: () => void): void {
  if (pending.length >= 1000) {
    console.warn('AI 用量待写入队列已满，部分统计缺失')
    return
  }
  pending.push(write)
  flush()
}
export const beginCall: UsageRepository['beginCall'] = (...a) =>
  enqueue(() => repository.beginCall(...a))
export const finishCall: UsageRepository['finishCall'] = (...a) =>
  enqueue(() => repository.finishCall(...a))
export const queryUsage: UsageRepository['queryUsage'] = (...a) => repository.queryUsage(...a)
