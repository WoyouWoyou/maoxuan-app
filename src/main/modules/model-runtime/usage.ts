import type { TokenUsage } from '@shared/contracts/usage'
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null
export function normalizeUsage(payload: any): TokenUsage | null {
  const u = payload?.usage ?? payload?.usage_metadata
  if (!u) return null
  const input = number(u.prompt_tokens ?? u.input_tokens),
    output = number(u.completion_tokens ?? u.output_tokens)
  const total =
    number(u.total_tokens) ?? (input !== null && output !== null ? input + output : null)
  if (input === null && output === null && total === null) return null
  return {
    input,
    output,
    total,
    source: 'provider',
    completeness: input !== null && output !== null && total !== null ? 'complete' : 'partial',
    reasoning: number(u.completion_tokens_details?.reasoning_tokens) ?? undefined,
    cacheRead:
      number(u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens) ?? undefined
  }
}
export function estimatedTokens(text: string): number {
  const cjk = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length
  return Math.ceil(cjk * 1.5 + (text.length - cjk) / 3)
}
export function estimateUsage(input: string, output: string, complete: boolean): TokenUsage {
  return {
    input: estimatedTokens(input),
    output: output ? estimatedTokens(output) : null,
    total: complete ? estimatedTokens(input) + estimatedTokens(output) : null,
    source: complete || output ? 'estimated' : 'unknown',
    completeness: complete ? 'complete' : 'partial'
  }
}
