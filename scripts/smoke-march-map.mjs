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
  await waitFor('!!window.api?.march')
  await route('/long-march')
  await screenshot('map-bounds-desktop')
  // Minimum zoom must ignore panning; zoomed dragging and zoom-out must never expose blank canvas.
  const dragMap = async () => {
    const box = await evaluate(
      '(()=>{const b=document.querySelector(".march-map-surface").getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height}})()'
    )
    const x = box.x + box.width * 0.7,
      y = box.y + box.height * 0.25
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    })
    await cdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x + box.width - 5,
      y: box.y + box.height - 5,
      buttons: 1
    })
    await cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x + box.width - 5,
      y: box.y + box.height - 5,
      button: 'left',
      clickCount: 1
    })
    await delay(80)
  }
  const coversCanvas = () =>
    evaluate(
      '(()=>{ const s=document.querySelector(".march-map-surface").getBoundingClientRect(), i=document.querySelector(".march-map-scene").getBoundingClientRect(); return i.left<=s.left+.1 && i.top<=s.top+.1 && i.right>=s.right-.1 && i.bottom>=s.bottom-.1 })()'
    )
  await dragMap()
  assert.equal(
    await evaluate('document.querySelector(".march-map-scene").style.transform'),
    'translate(0px, 0px) scale(1)'
  )
  await evaluate(`document.querySelector('[aria-label="放大地图"]').click()`)
  await dragMap()
  assert.equal(await coversCanvas(), true, 'zoomed dragging keeps the canvas covered')
  await evaluate(`document.querySelector('[aria-label="缩小地图"]').click()`)
  assert.equal(await coversCanvas(), true, 'zooming out reclamps the offset')
  await screenshot('map-bounds-desktop')
  await evaluate(`document.querySelector('[aria-label="放大地图"]').click()`)
  await dragMap()
  await screenshot('map-bounds-narrow', 1100, 720)
  assert.equal(await coversCanvas(), true, 'resizing keeps map covered')
  await evaluate(`document.querySelector('[aria-label="复位地图"]').click()`)
  assert.equal(
    await evaluate('document.querySelector(".march-map-scene").style.transform'),
    'translate(0px, 0px) scale(1)'
  )
  assert.deepEqual(rendererErrors, [])
  console.log(
    'Map bounds smoke passed: minimum zoom drag locked; zoomed drag, zoom-out, resize and reset keep viewport covered.'
  )
} finally {
  await stop()
}
