import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { Session } from 'electron'
import { getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { createProxyController } from '../src/main/adapters/network/proxy'
import { normalizeProxySettings } from '../src/shared/contracts/proxy'
import { validateIpcArguments } from '../src/shared/contracts/ipc'
import {
  configureSettings,
  configureProxy,
  getProxySettings,
  setProxySettings
} from '../src/main/modules/settings/public'

const original = getGlobalDispatcher()
afterEach(() => setGlobalDispatcher(original))
function fakeSession() {
  return {
    setProxy: vi.fn().mockResolvedValue(undefined),
    closeAllConnections: vi.fn().mockResolvedValue(undefined)
  }
}
function settingsRepository() {
  const values = new Map<string, string>()
  return {
    read: (k: string) => values.get(k) ?? null,
    write: (k: string, v: string) => {
      values.set(k, v)
    },
    transaction: <T>(work: () => T) => work(),
    readSecret: () => '',
    writeSecret: () => {}
  }
}

describe('global network proxy', () => {
  it('validates IPC and rejects empty enabled, unsupported, credential and non-address inputs', () => {
    expect(normalizeProxySettings({ enabled: true, url: ' socks5://127.0.0.1:1080 ' })).toEqual({
      enabled: true,
      url: 'socks5://127.0.0.1:1080'
    })
    for (const url of [
      '',
      'localhost:7890',
      'file:///tmp/proxy',
      'http://user:pass@localhost:7890',
      'http://localhost:7890/path'
    ])
      expect(() => normalizeProxySettings({ enabled: true, url })).toThrow('代理地址')
    expect(() => validateIpcArguments('settings:setProxy', [{ enabled: 'yes', url: '' }])).toThrow()
    expect(() => validateIpcArguments('settings:getProxy', [])).not.toThrow()
  })

  it('persists global settings, restores on restart, and preserves the address while disabled', async () => {
    const repo = settingsRepository()
    configureSettings(repo)
    const apply = vi.fn().mockResolvedValue(undefined)
    await configureProxy(apply)
    const next = { enabled: true, url: 'http://127.0.0.1:7890' }
    await setProxySettings(next)
    expect(getProxySettings()).toEqual(next)
    const restored = vi.fn().mockResolvedValue(undefined)
    configureSettings(repo)
    await configureProxy(restored)
    expect(restored).toHaveBeenCalledWith(next)
    restored.mockRejectedValueOnce(new Error('cannot apply'))
    await expect(setProxySettings({ ...next, url: 'http://127.0.0.1:9999' })).rejects.toThrow(
      'cannot apply'
    )
    expect(getProxySettings()).toEqual(next)
    await setProxySettings({ ...next, enabled: false })
    expect(getProxySettings()).toEqual({ ...next, enabled: false })
    expect(restored).toHaveBeenLastCalledWith({ ...next, enabled: false })
  })

  it('rolls runtime back when persistence fails and serializes rapid changes', async () => {
    const repo = settingsRepository()
    configureSettings(repo)
    const apply = vi.fn().mockResolvedValue(undefined)
    await configureProxy(apply)
    const write = vi.spyOn(repo, 'write').mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    await expect(setProxySettings({ enabled: true, url: 'http://localhost:7890' })).rejects.toThrow(
      'disk full'
    )
    expect(apply).toHaveBeenLastCalledWith({ enabled: false, url: '' })
    write.mockRestore()
    await Promise.all([
      setProxySettings({ enabled: true, url: 'http://localhost:7890' }),
      setProxySettings({ enabled: false, url: '' })
    ])
    expect(getProxySettings()).toEqual({ enabled: false, url: '' })
  })

  it('routes real Node fetch through CONNECT, fails closed, and restores direct access', async () => {
    const target = createServer((_req, res) => res.end('target response'))
    const proxy = createServer()
    let tunnels = 0
    const sockets = new Set<import('node:net').Socket>()
    proxy.on('connect', (_req, client, head) => {
      tunnels++
      const upstream = connect((target.address() as AddressInfo).port, '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        client.pipe(upstream).pipe(client)
      })
      for (const socket of [client, upstream]) {
        sockets.add(socket)
        socket.on('error', () => {})
        socket.on('close', () => sockets.delete(socket))
      }
    })
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve))
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const ses = fakeSession()
    const apply = createProxyController(() => [ses as unknown as Session])
    const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    const targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
    try {
      await apply({ enabled: true, url })
      // DNS cannot resolve this target; only our proxy can reach the server.
      expect(
        await (
          await fetch('http://proxy-only.invalid/test', { signal: AbortSignal.timeout(3000) })
        ).text()
      ).toBe('target response')
      expect(tunnels).toBe(1)
      expect(ses.setProxy).toHaveBeenLastCalledWith({
        mode: 'fixed_servers',
        proxyRules: url,
        proxyBypassRules: '<-loopback>'
      })
      await apply({ enabled: true, url: 'http://127.0.0.1:1' })
      await expect(fetch(targetUrl, { signal: AbortSignal.timeout(2000) })).rejects.toThrow()
      await apply({ enabled: false, url })
      expect(await (await fetch(targetUrl)).text()).toBe('target response')
      expect(ses.setProxy).toHaveBeenLastCalledWith({ mode: 'direct' })
      expect(ses.closeAllConnections).toHaveBeenCalledTimes(3)
    } finally {
      await apply({ enabled: false, url: '' })
      for (const socket of sockets) socket.destroy()
      target.closeAllConnections()
      await Promise.all([
        new Promise<void>((r) => target.close(() => r())),
        new Promise<void>((r) => proxy.close(() => r()))
      ])
    }
  })

  it('keeps the prior Node dispatcher if Electron rejects the new configuration', async () => {
    const ses = fakeSession()
    const apply = createProxyController(() => [ses as unknown as Session])
    await apply({ enabled: false, url: '' })
    const previous = getGlobalDispatcher()
    ses.setProxy.mockRejectedValueOnce(new Error('failed'))
    await expect(apply({ enabled: true, url: 'http://127.0.0.1:7890' })).rejects.toThrow('failed')
    expect(getGlobalDispatcher()).toBe(previous)
    expect(ses.setProxy).toHaveBeenLastCalledWith({ mode: 'direct' })
  })
})
