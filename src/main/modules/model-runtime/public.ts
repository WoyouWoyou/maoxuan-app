import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Settings } from '@shared/types'
import type { CallContext, TokenUsage } from '@shared/contracts/usage'
import { estimateUsage } from './usage'
import { RequestError, type LlmMessage, type ModelTransportPort } from './transport'
export type { LlmMessage } from './transport'
type Recorder = {
  begin: (id: string, ctx: CallContext, model: string, endpoint: string) => void
  finish: (id: string, status: string, usage: TokenUsage, duration: number) => void
}
let recorder: Recorder | undefined
let transport: ModelTransportPort
const context = new AsyncLocalStorage<CallContext>()
const controllers = new Map<string, Set<AbortController>>()
let activeRequests = 0
const waiting: { signal: AbortSignal; priority: number; start: () => void }[] = []
function acquire(signal: AbortSignal, priority: number): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const i = waiting.indexOf(item)
      if (i >= 0) waiting.splice(i, 1)
      reject(new Error('请求已取消'))
    }
    const item = {
      signal,
      priority,
      start: () => {
        signal.removeEventListener('abort', cancel)
        if (signal.aborted) {
          reject(new Error('请求已取消'))
          return
        }
        activeRequests++
        resolve(() => {
          activeRequests--
          const next = waiting.sort((a, b) => b.priority - a.priority).shift()
          next?.start()
        })
      }
    }
    if (signal.aborted) {
      reject(new Error('请求已取消'))
      return
    }
    signal.addEventListener('abort', cancel, { once: true })
    if (activeRequests < 3) item.start()
    else waiting.push(item)
  })
}
export function configureModelRuntime(value: Recorder, port: ModelTransportPort): void {
  recorder = value
  transport = port
}
export function withModelContext<T>(ctx: CallContext, fn: () => T): T {
  return context.run({ ...ctx, operationId: ctx.operationId ?? randomUUID() }, fn)
}
export function cancelModelCalls(sessionId: string): void {
  for (const controller of controllers.get(sessionId) ?? [])
    controller.abort(new Error('已取消 AI 请求'))
}
function report(fn: () => void) {
  try {
    fn()
  } catch {
    console.warn('AI 用量记录失败，本次统计可能不完整')
  }
}
function contentJson<T>(text: string): T {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(clean) as T
  } catch {
    throw new RequestError('AI 返回的不是合法 JSON，请重试')
  }
}
async function execute(
  s: Settings,
  messages: LlmMessage[],
  stream: boolean,
  onDelta?: (d: string) => void,
  json = true
): Promise<string> {
  if (!s.apiKey?.trim()) throw new Error('请先在设置中填写 API Key')
  const settings = { ...s },
    ctx: CallContext = {
      ...(context.getStore() ?? { purpose: 'unspecified', operationId: randomUUID() }),
      modelConfigId: settings.configId ?? 'default'
    }
  const endpoint = `${(settings.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '')}/chat/completions`
  const model = settings.model || 'deepseek-v4-flash'
  const parsedEndpoint = new URL(endpoint)
  if (!['http:', 'https:'].includes(parsedEndpoint.protocol))
    throw new Error('模型地址必须为 HTTP 或 HTTPS')
  ctx.requestOptions = {
    temperatureEnabled: settings.temperatureEnabled !== false,
    streamUsage: settings.streamUsage !== false,
    maxTokens: ctx.purpose === 'connection_test' ? 64 : stream ? 8192 : 16384
  }
  const deadline =
    Date.now() + (ctx.purpose === 'connection_test' ? 30000 : stream ? 180000 : 240000)
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = randomUUID(),
      controller = new AbortController(),
      started = Date.now()
    if (ctx.signal?.aborted) throw new Error('已取消 AI 请求')
    const cancel = () => controller.abort(ctx.signal?.reason)
    ctx.signal?.addEventListener('abort', cancel, { once: true })
    if (ctx.sessionId) {
      const set = controllers.get(ctx.sessionId) ?? new Set()
      set.add(controller)
      controllers.set(ctx.sessionId, set)
    }
    const timer = setTimeout(
      () => controller.abort(new Error('AI 请求超时')),
      Math.max(1, deadline - Date.now())
    )
    let output = '',
      usage: TokenUsage | null = null,
      status = 'failed',
      emitted = false,
      retry = false
    let release: (() => void) | undefined,
      dispatched = false
    try {
      release = await acquire(controller.signal, ctx.purpose === 'book_index' ? 0 : 1)
      controller.signal.throwIfAborted()
      dispatched = true
      report(() => recorder?.begin(id, ctx, model, new URL(endpoint).origin))
      const text = await transport.send(
        { ...settings, model },
        {
          messages,
          stream,
          json,
          maxTokens: ctx.purpose === 'connection_test' ? 64 : stream ? 8192 : 16384
        },
        controller.signal,
        (delta) => {
          output += delta
          emitted = true
          onDelta?.(delta)
        },
        (nextUsage) => {
          usage = nextUsage
        }
      )
      if (!stream) output = text
      if (!output.trim() && ctx.purpose !== 'connection_test')
        throw new RequestError('AI 没有返回正文')
      status = 'invalid_response'
      if (!stream && json && ctx.purpose !== 'connection_test') contentJson(output)
      status = 'succeeded'
      return output
    } catch (e) {
      status = controller.signal.aborted
        ? 'cancelled'
        : status === 'invalid_response'
          ? status
          : 'failed'
      retry =
        !emitted &&
        !controller.signal.aborted &&
        ((e instanceof RequestError && e.retryable) || e instanceof TypeError) &&
        attempt === 0 &&
        Date.now() + 1500 < deadline
      if (!retry)
        throw controller.signal.aborted
          ? new Error(ctx.signal?.aborted ? '已取消 AI 请求' : 'AI 请求已取消或超时')
          : e
    } finally {
      clearTimeout(timer)
      ctx.signal?.removeEventListener('abort', cancel)
      if (ctx.sessionId) {
        const set = controllers.get(ctx.sessionId)
        set?.delete(controller)
        if (!set?.size) controllers.delete(ctx.sessionId)
      }
      release?.()
      if (dispatched)
        report(() =>
          recorder?.finish(
            id,
            status,
            usage ?? estimateUsage(JSON.stringify(messages), output, status === 'succeeded'),
            Date.now() - started
          )
        )
    }
    if (retry)
      await new Promise<void>((resolve, reject) => {
        const backoff = new AbortController()
        const set = ctx.sessionId
          ? (controllers.get(ctx.sessionId) ?? new Set<AbortController>())
          : undefined
        if (ctx.sessionId && set) {
          set.add(backoff)
          controllers.set(ctx.sessionId, set)
        }
        const cleanup = () => {
          ctx.signal?.removeEventListener('abort', cancel)
          set?.delete(backoff)
          if (ctx.sessionId && !set?.size) controllers.delete(ctx.sessionId)
        }
        const cancel = () => backoff.abort()
        const timer = setTimeout(() => {
          cleanup()
          resolve()
        }, 1000)
        backoff.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            cleanup()
            reject(new Error('已取消 AI 请求'))
          },
          { once: true }
        )
        ctx.signal?.addEventListener('abort', cancel, { once: true })
        if (ctx.signal?.aborted) cancel()
      })
  }
  throw new Error('AI 请求失败')
}
export async function callJson<T>(s: Settings, system: string, user: string): Promise<T> {
  return contentJson<T>(
    await execute(
      s,
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      false
    )
  )
}
export function streamChat(
  s: Settings,
  messages: LlmMessage[],
  onDelta: (d: string) => void
): Promise<string> {
  return execute(s, messages, true, onDelta)
}
export async function testConnection(s: Settings): Promise<{ ok: boolean; message: string }> {
  try {
    await withModelContext({ purpose: 'connection_test' }, () =>
      execute(s, [{ role: 'user', content: '你好' }], false, undefined, false)
    )
    return { ok: true, message: `连接成功：${s.model}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '连接失败' }
  }
}
