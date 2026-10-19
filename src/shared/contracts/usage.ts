export interface CallContext {
  modelConfigId?: string
  requestOptions?: { temperatureEnabled: boolean; streamUsage: boolean; maxTokens: number }
  purpose: string
  sessionId?: string
  bookId?: string
  revisionId?: string
  runId?: string
  operationId?: string
  signal?: AbortSignal
}
export interface TokenUsage {
  input: number | null
  output: number | null
  total: number | null
  source: 'provider' | 'estimated' | 'unknown'
  completeness: 'complete' | 'partial'
  reasoning?: number
  cacheRead?: number
}
export interface UsageQuery {
  days?: number
  bookId?: string
  sessionId?: string
}
export interface UsageRow {
  purpose: string
  model: string
  calls: number
  input: number
  output: number
  total: number
  estimated: number
  unknown: number
  failed: number
}
export interface UsageStats {
  rows: UsageRow[]
  calls: number
  total: number
  estimated: number
  unknown: number
}
