import type { ModelTransportPort } from '../../modules/model-runtime/transport'
import { RequestError } from '../../modules/model-runtime/transport'
import { normalizeUsage } from '../../modules/model-runtime/usage'
export const chatCompletionsTransport: ModelTransportPort = {
  async send(settings, request, signal, onText, onUsage) {
    const endpoint = `${(settings.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '')}/chat/completions`
    const response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: request.messages,
        stream: request.stream,
        ...(request.stream && settings.streamUsage !== false
          ? { stream_options: { include_usage: true } }
          : {}),
        ...(!request.stream && request.json ? { response_format: { type: 'json_object' } } : {}),
        ...(settings.temperatureEnabled === false
          ? {}
          : { temperature: request.stream ? 0.7 : 0.3 }),
        max_tokens: request.maxTokens
      })
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new RequestError(
        response.status === 401
          ? 'API Key 无效或已过期（401）'
          : `模型服务请求失败（${response.status}）`,
        response.status === 429 || [502, 503, 504].includes(response.status)
      )
    }
    if (!request.stream) {
      const payload = (await response.json()) as any
      const usage = normalizeUsage(payload)
      if (usage) onUsage(usage)
      if (payload.choices?.[0]?.finish_reason === 'length')
        throw new RequestError('AI 输出达到长度上限，请缩小阅读范围')
      return typeof payload.choices?.[0]?.message?.content === 'string'
        ? payload.choices[0].message.content
        : ''
    }
    if (!response.body) throw new RequestError('AI 返回空响应')
    const reader = response.body.getReader(),
      decoder = new TextDecoder()
    let buffer = '',
      doneEvent = false,
      finishReason = '',
      output = ''
    const parse = (line: string) => {
      if (!line.trim().startsWith('data:')) return
      const data = line.trim().slice(5).trim()
      if (data === '[DONE]') {
        doneEvent = true
        return
      }
      if (!data) return
      const payload = JSON.parse(data),
        usage = normalizeUsage(payload)
      if (usage) onUsage(usage)
      finishReason = payload.choices?.[0]?.finish_reason ?? finishReason
      const delta = payload.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        output += delta
        onText(delta)
      }
    }
    try {
      while (!doneEvent) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        let i: number
        while ((i = buffer.indexOf('\n')) >= 0) {
          parse(buffer.slice(0, i))
          buffer = buffer.slice(i + 1)
        }
      }
      buffer += decoder.decode()
      if (!doneEvent && buffer.trim()) parse(buffer)
      if (!doneEvent && !finishReason)
        throw new RequestError('AI 连接中断，已显示部分内容，请手动重试')
      if (finishReason === 'length') throw new RequestError('AI 输出达到长度上限，已保留部分内容')
      return output
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
