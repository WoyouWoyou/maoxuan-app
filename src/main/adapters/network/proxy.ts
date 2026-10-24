import { Agent, ProxyAgent, Socks5ProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici'
import type { Session } from 'electron'
import { normalizeProxySettings, type ProxySettings } from '@shared/contracts/proxy'

/** Covers Node fetch (all model calls) and Chromium/Electron session traffic. */
export function createProxyController(sessions: () => Session[]) {
  const direct = new Agent()
  let current: Dispatcher = direct
  let active: ProxySettings = { enabled: false, url: '' }
  const config = (s: ProxySettings): Electron.ProxyConfig =>
    s.enabled
      ? {
          mode: 'fixed_servers',
          proxyRules: s.url.replace(/^socks:/, 'socks5:'),
          proxyBypassRules: '<-loopback>'
        }
      : { mode: 'direct' }
  return async (input: ProxySettings): Promise<void> => {
    const next = normalizeProxySettings(input)
    const dispatcher = next.enabled
      ? next.url.startsWith('socks')
        ? new Socks5ProxyAgent(next.url)
        : new ProxyAgent({ uri: next.url, proxyTunnel: true })
      : direct
    const targets = sessions()
    try {
      for (const target of targets) {
        await target.setProxy(config(next))
        await target.closeAllConnections()
      }
    } catch (error) {
      for (const target of targets) await target.setProxy(config(active))
      if (dispatcher !== direct) void dispatcher.close().catch(() => {})
      throw error
    }
    const previous = current
    setGlobalDispatcher(dispatcher)
    current = dispatcher
    active = next
    if (previous !== direct && previous !== dispatcher) void previous.close().catch(() => {})
  }
}
