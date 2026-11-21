/** Real Electron/IPC smoke test in disposable userData; never touches the user's database. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json'))
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'march-smoke-'))
const evidence = path.resolve('docs/images/long-march')
await fs.mkdir(evidence, { recursive: true })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let logs = '',
  proc,
  socket,
  seq = 0
const pending = new Map(),
  rendererErrors = []
const launch = () => {
  proc = spawn(require('electron'), ['.', '--remote-debugging-port=9467'], {
    env: { ...process.env, MAOXUAN_USER_DATA: root, MAOXUAN_TEST: '1', ELECTRON_RENDERER_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  proc.stderr.on('data', (data) => {
    logs += data
  })
  proc.stdout.on('data', (data) => {
    logs += data
  })
}
async function connect() {
  let page
  for (let i = 0; i < 100; i++) {
    try {
      page = (await (await fetch('http://127.0.0.1:9467/json')).json()).find(
        (t) => t.type === 'page'
      )
    } catch {}
    if (page) break
    await delay(100)
  }
  if (!page) throw new Error(`App did not start: ${logs}`)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Runtime.exceptionThrown') rendererErrors.push(msg.params.exceptionDetails)
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error')
      rendererErrors.push(msg.params.entry)
    if (msg.id) {
      const promise = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? promise?.reject(new Error(msg.error.message)) : promise?.resolve(msg.result)
    }
  }
  await cdp('Runtime.enable')
  await cdp('Log.enable')
}
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
const api = (body) => evaluate(`(async()=>{${body}})()`)
async function waitFor(expression) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(expression)) return
    await delay(75)
  }
  throw new Error(`Timed out: ${expression}`)
}
async function route(hash) {
  await evaluate(
    `location.hash=${JSON.stringify(hash)}; window.dispatchEvent(new Event('sessions-changed'))`
  )
  await waitFor(
    `!document.querySelector('.march-loading') && !!document.querySelector('.march-page,.march-scenery')`
  )
  await delay(120)
}
async function screenshot(name, width = 1440, height = 1024) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await waitFor(`Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)`)
  await delay(100)
  const { data } = await cdp('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  })
  await fs.writeFile(path.join(evidence, `${name}.png`), Buffer.from(data, 'base64'))
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
    `${name}: horizontal overflow`
  )
}
async function stop() {
  socket?.close()
  if (!proc || proc.exitCode !== null) return
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  proc.kill('SIGTERM')
  await exited
}
try {
  launch()
  await connect()
  await waitFor('!!window.api?.settings?.getFeatures')
  await evaluate('location.hash="/settings"')
  const toggle = `document.querySelector('section[aria-label="功能显示设置"] input[role="switch"]')`
  await waitFor(toggle + ' && !' + toggle + '.disabled')
  assert.equal(await api('return (await window.api.settings.getFeatures()).longMarch'), true)
  const action = await api(
    'return await window.api.actions.create({text:"保留成长进度的隔离验证"})'
  )
  await api(`await window.api.actions.edit('${action.id}',{status:'done'})`)
  const before = await api('return await window.api.march.get()')
  assert.equal(before.earned, 10)
  await evaluate(toggle + '.click()')
  await waitFor(`!document.querySelector('.sb a[href="#/long-march"]')`)
  assert.equal(await evaluate('document.querySelector(".growth-pickup-layer") === null'), true)
  assert.equal(await api('return (await window.api.settings.getFeatures()).longMarch'), false)
  await evaluate(`document.querySelector('button[title="收起侧栏"]').click()`)
  await waitFor('!!document.querySelector(".sb.is-collapsed")')
  assert.equal(
    await evaluate(`document.querySelector('.sb a[href="#/long-march"]') === null`),
    true
  )
  await evaluate('location.hash="/long-march/yudu"')
  await waitFor('location.hash==="#/settings"')
  await screenshot('settings-march-hidden')
  await stop()
  launch()
  await connect()
  await waitFor('!!window.api?.settings?.getFeatures')
  assert.equal(await api('return (await window.api.settings.getFeatures()).longMarch'), false)
  assert.deepEqual(await api('return await window.api.march.get()'), before)
  await evaluate('location.hash="/settings"')
  await waitFor(toggle + ' && !' + toggle + '.disabled')
  assert.equal(await evaluate(toggle + '.checked'), false)
  await evaluate(toggle + '.click()')
  await waitFor(`!!document.querySelector('.sb a[href="#/long-march"]')`)
  await evaluate('location.hash="/long-march"')
  await waitFor('!!document.querySelector(".march-map")')
  assert.deepEqual(await api('return await window.api.march.get()'), before)
  assert.deepEqual(rendererErrors, [])
  console.log(
    'Feature visibility smoke passed: toggle, expanded/collapsed sidebar, pickup suppression, route guard, persisted restart and restored progress.'
  )
} finally {
  await stop()
}
