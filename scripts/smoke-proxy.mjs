import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'maoxuan-proxy-'))
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const target = http.createServer(async (req, res) => {
  for await (const _chunk of req) {
    /* drain request */
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }))
})
const proxy = http.createServer((_req, res) => {
  forwards++
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end('renderer proxied')
})
let forwards = 0,
  tunnels = 0
const sockets = new Set()
proxy.on('connect', (_req, client, head) => {
  tunnels++
  const upstream = net.connect(target.address().port, '127.0.0.1', () => {
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
await new Promise((r) => target.listen(0, '127.0.0.1', r))
await new Promise((r) => proxy.listen(0, '127.0.0.1', r))
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`
let child, socket
async function stop() {
  socket?.close()
  if (child && child.exitCode === null) {
    const done = new Promise((r) => child.once('exit', r))
    child.kill()
    await done
  }
}
async function start() {
  let logs = ''
  child = spawn(require('electron'), ['.', '--remote-debugging-port=9437'], {
    env: { ...process.env, MAOXUAN_USER_DATA: root, MAOXUAN_TEST: '1', ELECTRON_RENDERER_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stderr.on('data', (b) => {
    logs += b
  })
  child.stdout.on('data', (b) => {
    logs += b
  })
  let page
  for (let i = 0; i < 80; i++) {
    try {
      const pages = await (await fetch('http://127.0.0.1:9437/json')).json()
      page = pages.find((p) => p.type === 'page')
      if (page) break
    } catch {}
    await delay(250)
  }
  assert.ok(page, logs)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    socket.onopen = r
    socket.onerror = j
  })
  let id = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (!msg.id) {
      if (msg.method === 'Log.entryAdded') console.error(msg.params.entry.text)
      return
    }
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  }
  const evaluate = async (expression) => {
    const result = await new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject })
      socket.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      )
    })
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      )
    return result.result.value
  }
  // Production CSP blocks renderer network calls; lift it only in this test to verify Chromium routing.
  socket.send(JSON.stringify({ id: ++id, method: 'Page.setBypassCSP', params: { enabled: true } }))
  pending.set(id, { resolve: () => {}, reject: () => {} })
  socket.send(JSON.stringify({ id: ++id, method: 'Log.enable' }))
  pending.set(id, { resolve: () => {}, reject: () => {} })
  for (let i = 0; i < 40; i++) {
    if (await evaluate('!!window.api')) break
    await delay(100)
  }
  return evaluate
}
try {
  let evaluate = await start()
  assert.deepEqual(await evaluate('window.api.settings.getProxy()'), { enabled: false, url: '' })
  await evaluate(
    `window.api.settings.set({ apiKey: 'smoke-key', baseUrl: 'http://model.proxy-only.invalid/v1', model: 'smoke' })`
  )
  await evaluate(
    `window.api.settings.setProxy({ enabled: true, url: ${JSON.stringify(proxyUrl)} })`
  )
  assert.equal((await evaluate('window.api.settings.test()')).ok, true)
  assert.ok(tunnels > 0, 'model requests must traverse proxy')
  assert.equal(
    await evaluate(`fetch('http://renderer.proxy-only.invalid/').then(r => r.text())`),
    'renderer proxied'
  )
  assert.ok(forwards > 0, 'Chromium requests must traverse proxy')
  await evaluate("location.hash = '#/settings'")
  await delay(300)
  assert.equal(await evaluate("document.querySelector('#proxy-enabled').checked"), true)
  assert.equal(await evaluate("document.querySelector('#proxy-url').value"), proxyUrl)
  await stop()
  evaluate = await start()
  assert.deepEqual(await evaluate('window.api.settings.getProxy()'), {
    enabled: true,
    url: proxyUrl
  })
  assert.equal((await evaluate('window.api.settings.test()')).ok, true)
  await evaluate(
    `window.api.settings.setProxy({ enabled: false, url: ${JSON.stringify(proxyUrl)} })`
  )
  await evaluate(
    `window.api.settings.set({ apiKey: '', baseUrl: 'http://127.0.0.1:${target.address().port}/v1', model: 'smoke' })`
  )
  const count = tunnels
  assert.equal((await evaluate('window.api.settings.test()')).ok, true)
  assert.equal(tunnels, count, 'disabled proxy must be bypassed')
  await evaluate(`window.api.settings.setProxy({ enabled: true, url: 'http://127.0.0.1:1' })`)
  assert.equal(
    (await evaluate('window.api.settings.test()')).ok,
    false,
    'unavailable proxy must not fall back to direct'
  )
  console.log(
    'Proxy smoke passed: model + Chromium routing, settings UI, restart restore, disabled direct access, failure without bypass'
  )
} catch (e) {
  console.error({ forwards, tunnels })
  throw e
} finally {
  await stop()
  for (const socket of sockets) socket.destroy()
  target.closeAllConnections()
  proxy.closeAllConnections()
  await Promise.all([new Promise((r) => target.close(r)), new Promise((r) => proxy.close(r))])
  await fs.rm(root, { recursive: true, force: true })
}
