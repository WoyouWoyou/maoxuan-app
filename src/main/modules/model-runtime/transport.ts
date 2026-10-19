import type { TokenUsage } from '@shared/contracts/usage'
import type { Settings } from '@shared/types'
export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export interface ModelTransportPort {
  send(
    settings: Settings,
    request: { messages: LlmMessage[]; stream: boolean; json: boolean; maxTokens: number },
    signal: AbortSignal,
    onText: (text: string) => void,
    onUsage: (usage: TokenUsage) => void
  ): Promise<string>
}
export class RequestError extends Error {
  constructor(
    message: string,
    readonly retryable = false
  ) {
    super(message)
  }
}
