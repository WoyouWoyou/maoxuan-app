import { object, bool, text } from './validation'

export interface ProxySettings {
  enabled: boolean
  url: string
}
export const proxySettingsSchema = object({ enabled: bool, url: text })

export function normalizeProxySettings(value: ProxySettings): ProxySettings {
  proxySettingsSchema(value, 'proxy')
  const url = value.url.trim()
  if (!url && !value.enabled) return { enabled: false, url: '' }
  try {
    const parsed = new URL(url)
    if (
      !['http:', 'https:', 'socks5:', 'socks:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname && parsed.pathname !== '/') ||
      parsed.search ||
      parsed.hash
    )
      throw new Error()
    return {
      enabled: value.enabled,
      url: parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin
    }
  } catch {
    throw new Error(
      '请输入有效的 HTTP、HTTPS 或 SOCKS5 代理地址（不含账号密码），例如 http://127.0.0.1:7890'
    )
  }
}
