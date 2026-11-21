/** Real Electron/IPC smoke test in disposable userData; never touches the user's database. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
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
  const overviewStory = await evaluate('document.querySelector(".march-landscape-preview img").src')
  await route('/long-march/yudu')
  await waitFor(
    '!!document.querySelector(".march-story-card") && document.querySelector(".march-story-card audio").readyState > 0'
  )
  assert.equal(
    await evaluate('document.querySelector(".march-story-card audio").paused'),
    true,
    'narration never autoplays'
  )
  assert.equal(
    await evaluate('document.querySelector(".march-story-illustration img").src'),
    overviewStory,
    'map previews story art'
  )
  await screenshot('story-card-desktop')
  await evaluate(
    'window.__oldNarration = document.querySelector(".march-story-card audio"); document.querySelector(".march-story-play").click()'
  )
  await waitFor('document.querySelector(".march-story-card audio").currentTime > .2')
  await evaluate('document.querySelector(".march-story-play").click()')
  assert.equal(await evaluate('document.querySelector(".march-story-card audio").paused'), true)
  await evaluate('document.querySelector(".march-transcript-toggle").click()')
  await evaluate('document.querySelectorAll(".march-story-transcript button")[1].click()')
  await waitFor('document.querySelector(".march-story-current > span").textContent.includes("02")')
  await evaluate(
    `(()=>{ const select=document.querySelector('[aria-label="故事播放速度"]'); select.value="1.5"; select.dispatchEvent(new Event("change",{bubbles:true})); })()`
  )
  await waitFor('document.querySelector(".march-story-card audio").playbackRate === 1.5')
  await screenshot('story-transcript-desktop')
  await route('/long-march/chishui')
  await waitFor('!!document.querySelector("#story-title-chishui")')
  assert.equal(
    await evaluate('window.__oldNarration.paused'),
    true,
    'node switching stops the old narration'
  )
  assert.equal(await evaluate('document.querySelector(".march-story-card audio").paused'), true)
  await screenshot('story-chishui-desktop')
  await screenshot('story-card-narrow', 1100, 720)
  await route('/long-march/album')
  assert.equal(
    await evaluate('document.querySelectorAll(".march-album-item > img").length'),
    0,
    'locked album reveals no reward CG'
  )
  assert.equal(await evaluate('document.querySelectorAll(".march-album-locked > img").length'), 12)
  await screenshot('story-album-locked')
  const ids = [
    'yudu',
    'xiangjiang',
    'zunyi',
    'chishui',
    'jinshajiang',
    'luding',
    'jiajin',
    'maogong',
    'ruoergai',
    'lazikou',
    'hadapu',
    'wuqi'
  ]
  for (const id of ids) {
    await route('/long-march/' + id)
    await waitFor(
      `!!document.querySelector('#story-title-${id}') && document.querySelector('.march-story-card audio').readyState > 0`
    )
    assert.equal(
      await evaluate('document.querySelector(".march-story-card audio").duration > 60'),
      true,
      id + ' narration metadata'
    )
  }
  // Seed only this test's disposable database with a station that has already waited 72h.
  const seed = `const Database=require(${JSON.stringify(path.resolve('node_modules/better-sqlite3'))}); const db=new Database(${JSON.stringify(path.join(root, 'maoxuan.db'))});
    db.transaction(()=>{for(let i=0;i<4;i++){db.prepare("INSERT INTO march_activities(id,kind,created_at,points,reward_day) VALUES(?,?,?,?,?)").run('story-fixture-'+i,'reading','2026-01-01',10,'2026-01-01'); db.prepare("INSERT INTO march_plants(request_id,node_id,planted_at) VALUES(?,?,?)").run('story-fixture-'+i,'yudu','2026-01-01T00:00:00.000Z')}})();db.close();`
  const seeded = spawnSync(require('electron'), ['-e', seed], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  })
  assert.equal(seeded.status, 0, seeded.stderr)
  await route('/long-march/yudu/scenery')
  await waitFor('!!document.querySelector(".march-scenery")')
  assert.notEqual(
    await evaluate('document.querySelector(".march-scenery-image").src'),
    overviewStory,
    'reward is a separate full landscape CG'
  )
  await waitFor('document.querySelector(".march-scenery audio").currentTime > .1')
  assert.equal(await evaluate('document.querySelector(".march-story-card") === null'), true)
  await screenshot('story-reward-unlocked')
  assert.deepEqual(rendererErrors, [])
  console.log(
    'Story smoke passed: all12 offline narrations, click play/pause, actual cue jump, speed, transcript, stop on navigation, locked spoilers hidden, unlocked CG/music preserved.'
  )
} finally {
  await stop()
}
