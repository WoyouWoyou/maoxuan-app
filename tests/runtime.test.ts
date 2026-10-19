import { chatCompletionsTransport } from '../src/main/adapters/model/chat-completions'
import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  normalizeUsage,
  estimateUsage,
  estimatedTokens
} from '../src/main/modules/model-runtime/usage'
import {
  callJson,
  streamChat,
  configureModelRuntime,
  withModelContext,
  cancelModelCalls
} from '../src/main/modules/model-runtime/public'
const settings = { apiKey: 'fake', baseUrl: 'https://example.invalid/v1', model: 'test' }
afterEach(() => vi.unstubAllGlobals())
describe('model runtime accounting', () => {
  it('does not invent missing counts or double-add reasoning/cache', () => {
    expect(normalizeUsage({ usage: { total_tokens: 100 } })).toMatchObject({
      input: null,
      output: null,
      total: 100,
      completeness: 'partial'
    })
    expect(
      normalizeUsage({
        usage: {
          prompt_tokens: 40,
          completion_tokens: 60,
          total_tokens: 100,
          completion_tokens_details: { reasoning_tokens: 30 }
        }
      })
    ).toMatchObject({ total: 100, reasoning: 30 })
    expect(estimatedTokens('中国')).toBeGreaterThan(estimatedTokens('ab'))
    expect(estimateUsage('hello', '', false).total).toBeNull()
  })
  it('records streamed usage even with empty choices and cumulative updates only once', async () => {
    const finish = vi.fn()
    configureModelRuntime({ begin: vi.fn(), finish }, chatCompletionsTransport)
    const sse = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
      'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: ' +
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }
        }),
      'data: [DONE]'
    ].join('\n\n')
    const encoder = new TextEncoder()
    const bytes = encoder.encode(sse)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(bytes.slice(0, 31))
                c.enqueue(bytes.slice(31))
                c.close()
              }
            })
          )
      )
    )
    const delta = vi.fn()
    expect(await streamChat(settings, [{ role: 'user', content: 'test' }], delta)).toBe('你好')
    expect(finish).toHaveBeenCalledTimes(1)
    expect(finish.mock.calls[0][2]).toMatchObject({ total: 13, source: 'provider' })
  })
  it('records each transient retry and does not retry authentication', async () => {
    const begin = vi.fn(),
      finish = vi.fn()
    configureModelRuntime({ begin, finish }, chatCompletionsTransport)
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
        })
      )
    vi.stubGlobal('fetch', fetch)
    expect(
      await withModelContext({ purpose: 'recommend', operationId: 'op' }, () =>
        callJson(settings, 'system', 'user')
      )
    ).toEqual({ ok: true })
    expect(begin).toHaveBeenCalledTimes(2)
    expect(finish).toHaveBeenCalledTimes(2)
    fetch.mockReset().mockResolvedValue(new Response('', { status: 401 }))
    await expect(callJson(settings, 's', 'u')).rejects.toThrow('401')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('cancels requests without retrying or assigning zero actual use', async () => {
    const finish = vi.fn()
    configureModelRuntime({ begin: vi.fn(), finish }, chatCompletionsTransport)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () => reject(new Error('aborted')))
          )
      )
    )
    const pending = withModelContext({ purpose: 'chat', sessionId: 's' }, () =>
      callJson(settings, 's', 'u')
    )
    await Promise.resolve()
    cancelModelCalls('s')
    await expect(pending).rejects.toThrow('取消')
    expect(finish.mock.calls[0][1]).toBe('cancelled')
    expect(finish.mock.calls[0][2].source).toBe('unknown')
  })
})
