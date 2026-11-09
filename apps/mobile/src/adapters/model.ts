import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { Settings } from '@shared/types'
import type { LlmMessage, CallJson } from '@shared/engine/ports'
export function createModelTransport() {
  const running = new Map<string, Set<AbortController>>()
  const cancel = (sessionId: string) => running.get(sessionId)?.forEach((c) => c.abort())
  async function request(
    sessionId: string,
    settings: Settings,
    messages: LlmMessage[],
    onDelta?: (text: string) => void
  ) {
    if (!settings.apiKey) throw new Error('请先在「我的 → AI 服务」配置 API Key')
    const base = new URL(settings.baseUrl)
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password)
      throw new Error('模型地址无效')
    if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
      throw new Error('远程模型服务请使用 HTTPS')
    const controller = new AbortController(),
      set = running.get(sessionId) ?? new Set<AbortController>()
    set.add(controller)
    running.set(sessionId, set)
    const timer = setTimeout(() => controller.abort(), 120_000)
    const stream = !!onDelta && !Capacitor.isNativePlatform()
    const body = {
      model: settings.model,
      messages,
      stream,
      ...(settings.temperatureEnabled ? { temperature: 0.7 } : {})
    }
    const url = settings.baseUrl.replace(/\/$/, '') + '/chat/completions'
    const headers = {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    }
    try {
      let text = ''
      if (Capacitor.isNativePlatform()) {
        // Native HTTP avoids provider browser CORS; cancelled responses are never applied.
        const response = await CapacitorHttp.post({
          url,
          headers,
          data: body,
          connectTimeout: 15000,
          readTimeout: 120000
        })
        if (response.status < 200 || response.status >= 300)
          throw new Error(`模型服务返回 HTTP ${response.status}`)
        text = response.data?.choices?.[0]?.message?.content ?? ''
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        })
        if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`)
        if (stream && response.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = response.body!.getReader(),
            decoder = new TextDecoder()
          let pending = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            pending += decoder.decode(value, { stream: true })
            const lines = pending.split('\n')
            pending = lines.pop()!
            for (const line of lines) {
              const payload = line.trim().replace(/^data:\s*/, '')
              if (!line.startsWith('data:') || payload === '[DONE]') continue
              const delta = JSON.parse(payload).choices?.[0]?.delta?.content
              if (typeof delta === 'string') {
                text += delta
                onDelta?.(delta)
              }
            }
          }
        } else {
          const result = await response.json()
          text = result.choices?.[0]?.message?.content ?? ''
          onDelta?.(text)
        }
      }
      if (controller.signal.aborted) throw new Error('请求已取消或超时，请重新发起；不会自动重试')
      if (!text.trim()) throw new Error('模型返回了空内容')
      return text
    } catch (error) {
      if (controller.signal.aborted) throw new Error('请求已取消或超时；不会自动重试')
      throw error
    } finally {
      clearTimeout(timer)
      set.delete(controller)
    }
  }
  const json =
    (sessionId: string): CallJson =>
    async <T>(s: Settings, system: string, user: string) => {
      const text = await request(sessionId, s, [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ])
      try {
        return JSON.parse(
          text
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
        ) as T
      } catch {
        throw new Error('AI 返回的不是合法 JSON，请重试')
      }
    }
  return { json, request, cancel }
}
