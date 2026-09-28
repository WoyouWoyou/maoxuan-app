import type { Settings } from '@shared/types'

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const NO_API_KEY = '请先在设置中填写 DeepSeek API Key'
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

// 推理模型的思考 token 也计入 max_tokens，长文标注时需要留足余量
const JSON_MAX_TOKENS = 16_384
const CHAT_MAX_TOKENS = 8_192
const JSON_TIMEOUT_MS = 240_000
const CHAT_TIMEOUT_MS = 180_000
const TEST_TIMEOUT_MS = 30_000

/** 我们自己抛出的错误，不再被包装成“AI 请求失败：……”。 */
class AiError extends Error {}

function hasKey(s: Settings): boolean {
  return Boolean(s && typeof s.apiKey === 'string' && s.apiKey.trim())
}

function modelOf(s: Settings): string {
  const model = s?.model?.trim()
  return model || DEFAULT_MODEL
}

function endpointOf(baseUrl: string): string {
  const base = (baseUrl || '').trim().replace(/\/+$/, '') || DEFAULT_BASE_URL
  return `${base}/chat/completions`
}

function headersOf(s: Settings): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${s.apiKey.trim()}`
  }
}

function shortText(text: string, max = 160): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function friendly(e: unknown, timeoutMs: number): string {
  if (e instanceof AiError) return e.message
  if (e instanceof Error) {
    if (e.name === 'AbortError') return `AI 请求超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试`
    return `AI 请求失败：${e.message}`
  }
  return `AI 请求失败：${String(e)}`
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return
  const body = shortText(await safeText(res))
  if (res.status === 401) {
    throw new AiError(`AI 请求失败（401）：API Key 无效或已过期，请到设置里检查 API Key 是否正确`)
  }
  throw new AiError(`AI 请求失败（${res.status}）：${body || '服务端未返回内容'}`)
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const matched = /^```[a-zA-Z]*\s*([\s\S]*?)```$/.exec(trimmed)
  return matched && matched[1] ? matched[1] : text
}

function parseJsonContent<T>(content: string): T {
  const raw = stripCodeFence(content).trim()
  try {
    return JSON.parse(raw) as T
  } catch {
    // 模型偶尔在 JSON 前后加解释文字，退回到“第一个 { 到最后一个 }”
  }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1)) as T
    } catch {
      // 仍然失败，走下面的统一报错
    }
  }
  throw new Error('AI 返回的不是合法 JSON')
}

/** 需要结构化结果的调用：response_format = json_object，超时 120s。 */
export async function callJson<T>(s: Settings, system: string, user: string): Promise<T> {
  if (!hasKey(s)) throw new Error(NO_API_KEY)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT_MS)
  let text = ''
  try {
    let res: Response
    try {
      res = await fetch(endpointOf(s.baseUrl), {
        method: 'POST',
        headers: headersOf(s),
        body: JSON.stringify({
          model: modelOf(s),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: JSON_MAX_TOKENS
        }),
        signal: controller.signal
      })
    } catch (e) {
      throw new AiError(friendly(e, JSON_TIMEOUT_MS))
    }
    await ensureOk(res)
    try {
      text = await res.text()
    } catch (e) {
      throw new AiError(friendly(e, JSON_TIMEOUT_MS))
    }
  } finally {
    clearTimeout(timer)
  }

  let payload: { choices?: { message?: { content?: unknown } }[] }
  try {
    payload = JSON.parse(text) as typeof payload
  } catch {
    throw new Error(`AI 返回的响应无法解析：${shortText(text)}`)
  }

  // 推理模型会返回 reasoning_content，这里只取 content
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI 没有返回内容，请稍后重试')
  }
  return parseJsonContent<T>(content)
}

function parseSseLine(line: string): { done: boolean; delta: string } {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { done: false, delta: '' }
  const payload = trimmed.slice(5).trim()
  if (!payload) return { done: false, delta: '' }
  if (payload === '[DONE]') return { done: true, delta: '' }
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: unknown } }[] }
    const delta = json?.choices?.[0]?.delta?.content
    return { done: false, delta: typeof delta === 'string' ? delta : '' }
  } catch {
    return { done: false, delta: '' }
  }
}

/** 流式对话：按 SSE 解析，累积 choices[0].delta.content，返回完整文本。 */
export async function streamChat(
  s: Settings,
  messages: LlmMessage[],
  onDelta: (d: string) => void
): Promise<string> {
  if (!hasKey(s)) throw new Error(NO_API_KEY)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(endpointOf(s.baseUrl), {
        method: 'POST',
        headers: headersOf(s),
        body: JSON.stringify({
          model: modelOf(s),
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: CHAT_MAX_TOKENS
        }),
        signal: controller.signal
      })
    } catch (e) {
      throw new AiError(friendly(e, CHAT_TIMEOUT_MS))
    }
    await ensureOk(res)
    if (!res.body) throw new AiError('AI 返回了空响应，请稍后重试')

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let full = ''
    let finished = false

    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        const parsed = parseSseLine(line)
        if (parsed.done) {
          finished = true
          break
        }
        if (parsed.delta) {
          full += parsed.delta
          onDelta(parsed.delta)
        }
        newline = buffer.indexOf('\n')
      }
    }

    // 处理最后一行没有换行符的残留
    if (!finished && buffer.trim()) {
      const parsed = parseSseLine(buffer)
      if (!parsed.done && parsed.delta) {
        full += parsed.delta
        onDelta(parsed.delta)
      }
    }

    return full
  } catch (e) {
    throw new Error(friendly(e, CHAT_TIMEOUT_MS))
  } finally {
    clearTimeout(timer)
  }
}

/** 测试连接：只要 2xx 就算通（推理模型可能把 token 花在思考上，不要求有 content）。 */
export async function testConnection(s: Settings): Promise<{ ok: boolean; message: string }> {
  if (!hasKey(s)) return { ok: false, message: NO_API_KEY }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(endpointOf(s.baseUrl), {
        method: 'POST',
        headers: headersOf(s),
        body: JSON.stringify({
          model: modelOf(s),
          messages: [{ role: 'user', content: '你好' }],
          max_tokens: 64
        }),
        signal: controller.signal
      })
    } catch (e) {
      return { ok: false, message: friendly(e, TEST_TIMEOUT_MS) }
    }

    if (!res.ok) {
      const body = shortText(await safeText(res))
      if (res.status === 401) {
        return { ok: false, message: 'API Key 无效或已过期，请检查后重试（401）' }
      }
      return { ok: false, message: `AI 请求失败（${res.status}）：${body || '服务端未返回内容'}` }
    }

    await safeText(res)
    return { ok: true, message: `连接成功，当前模型：${modelOf(s)}` }
  } catch (e) {
    return { ok: false, message: friendly(e, TEST_TIMEOUT_MS) }
  } finally {
    clearTimeout(timer)
  }
}
