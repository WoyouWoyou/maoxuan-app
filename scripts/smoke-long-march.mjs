/** Real Electron/IPC smoke test in disposable userData; never touches the user's database. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
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
  await waitFor('!!window.api?.march')
  await route('/long-march')
  assert.equal(await api('return (await window.api.march.get()).balance'), 0)
  await route('/long-march/yudu')
  assert.equal(
    await evaluate('document.querySelector(".march-node-panel .btn-primary").disabled'),
    true
  )
  await route('/long-march/wuqi/scenery')
  assert.equal(
    await evaluate('!!document.querySelector(".march-scenery")'),
    false,
    'locked finale stays locked'
  )
  // Earn through the same IPC and source writes used by the application.
  await api(`const action = await window.api.actions.create({ text: '长征隔离测试：记录有效进展' });
    for(let i=0;i<48;i++) await window.api.actions.edit(action.id,{},'已完成调查与记录 '+i);
    return action.id;`)
  const earned = await api('return await window.api.march.get()')
  assert.equal(earned.balance, 480)
  assert.equal(earned.counts.action, 48)
  await api(`for (const id of ['yudu','xiangjiang']) for(let i=0;i<4;i++) await window.api.march.plant(id,id+'-'+i);
    for(let i=0;i<2;i++) await window.api.march.plant('zunyi','zunyi-'+i);`)
  await route('/long-march')
  await evaluate(`document.querySelector('[aria-label="放大地图"]').click()`)
  await waitFor(
    'document.querySelector(".march-map-scene").style.transform.includes("scale(1.25)")'
  )
  await evaluate(`document.querySelector('[aria-label="复位地图"]').click()`)
  await waitFor('document.querySelector(".march-map-scene").style.transform.includes("scale(1)")')
  await screenshot('overview-desktop')
  await route('/long-march/zunyi')
  await screenshot('node-desktop')
  await screenshot('node-narrow', 1100, 720)
  await api(`await window.api.march.plant('zunyi','zunyi-2');`)
  await route('/long-march/zunyi')
  await waitFor('document.querySelector(".march-node-panel .btn-primary")?.disabled === false')
  // Trigger the actual primary control and check automatic CG navigation and playback.
  await evaluate('document.querySelector(".march-node-panel .btn-primary").click()')
  await waitFor('!!document.querySelector(".march-scenery")')
  await waitFor('document.querySelector("audio")?.currentTime > 0.15')
  const balance = await api('return (await window.api.march.get()).balance')
  assert.equal(balance, 360)
  await evaluate('document.querySelector(".march-play").click()')
  assert.equal(await evaluate('document.querySelector("audio").paused'), true)
  await evaluate('document.querySelector(".march-reward-actions .btn").click()')
  await waitFor('document.querySelector(".march-reward-actions .btn").disabled')
  assert.equal(await api(`return (await window.api.march.get()).collected.includes('zunyi')`), true)
  await screenshot('scenery-desktop')
  await route('/long-march/album')
  await screenshot('album-desktop')
  await api(
    `for(const id of ['chishui','jinshajiang','luding','jiajin','maogong','ruoergai','lazikou','hadapu','wuqi']) for(let i=0;i<4;i++) await window.api.march.plant(id,id+'-'+i);`
  )
  await route('/long-march/wuqi/scenery')
  await evaluate('document.querySelector(".march-play").click()')
  await waitFor('document.querySelector("audio")?.currentTime > 0.15')
  await screenshot('finale-desktop')
  await waitFor(
    'document.querySelector(".march-scenery-footer").classList.contains("is-collapsed")'
  )
  assert.equal(
    await evaluate('document.querySelector("audio").paused'),
    false,
    'collapsing controls keeps audio playing'
  )
  const playbackBeforeExpand = await evaluate('document.querySelector("audio").currentTime')
  await screenshot('scenery-panel-collapsed')
  await evaluate('document.querySelector(".march-panel-toggle").click()')
  await waitFor(
    '!document.querySelector(".march-scenery-footer").classList.contains("is-collapsed")'
  )
  assert.equal(
    await evaluate('document.querySelector("audio").currentTime >= ' + playbackBeforeExpand),
    true,
    'expanding does not restart the audio'
  )
  await screenshot('scenery-panel-expanded')
  assert.equal(await api('return (await window.api.march.get()).completed'), true)
  await stop()
  launch()
  await connect()
  await waitFor('!!window.api?.march')
  const restored = await api('return await window.api.march.get()')
  assert.equal(restored.completed, true)
  assert.equal(restored.balance, 0)
  assert.equal(restored.collected.includes('zunyi'), true)
  await route('/long-march')
  await screenshot('complete-narrow', 1100, 720)
  await route('/long-march/album')
  await waitFor(
    'document.querySelectorAll(".march-album-item > img").length === 12 && Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)'
  )
  assert.equal(
    await evaluate(
      'new Set(Array.from(document.querySelectorAll(".march-album-item > img"), i => i.src)).size'
    ),
    12,
    'every node has its own CG'
  )
  await screenshot('album-twelve-desktop')
  assert.deepEqual(rendererErrors, [], 'renderer has no uncaught exceptions or asset errors')
  console.log(
    'Long March smoke passed: real activity IPC, growth, CG auto-unlock, audio playback/pause, collection, 48 plants, restart persistence, desktop/narrow rendering. Disposable database: ' +
      root
  )
} finally {
  await stop()
}
