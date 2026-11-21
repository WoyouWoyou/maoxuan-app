/** Real Electron/IPC smoke test in disposable userData; never touches the user's database. */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-smoke-'))
const evidence = path.resolve('docs/images/journal')
await fs.mkdir(evidence, { recursive: true })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let logs = '',
  proc,
  socket,
  seq = 0
const pending = new Map(),
  rendererErrors = []
const launch = () => {
  proc = spawn(
    require('electron'),
    [
      '.',
      '--remote-debugging-port=9468',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream'
    ],
    {
      env: {
        ...process.env,
        MAOXUAN_USER_DATA: root,
        MAOXUAN_TEST: '1',
        ELECTRON_RENDERER_URL: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
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
      page = (await (await fetch('http://127.0.0.1:9468/json')).json()).find(
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
  const force = setTimeout(() => proc.kill('SIGKILL'), 2000)
  proc.kill('SIGTERM')
  await exited
  clearTimeout(force)
}
try {
  launch()
  await connect()
  await waitFor('!!window.api?.journal')
  const ids = await api(`
    let r = await window.api.journal.apply({kind:'folderCreate',name:'2026',parentId:null}); const year=r.state.folders[0].id;
    r=await window.api.journal.apply({kind:'folderCreate',name:'毛选工具箱',parentId:year}); const project=r.state.folders.at(-1).id;
    r=await window.api.journal.apply({kind:'folderCreate',name:'需求记录',parentId:project}); const folder=r.state.folders.at(-1).id;
    r=await window.api.journal.apply({kind:'noteCreate',folderId:folder}); const id=r.selectedId;
    await window.api.journal.apply({kind:'noteSave',id,revision:0,title:'一次沟通后的感受',markdown:'今天和同事聊了一个推进很久的问题。\\n\\n## 今天的一点收获\\n\\n> 先把问题听完整，再一起寻找办法。\\n\\n- [x] 认真听完对方的想法\\n- [ ] 把共识整理成具体行动',tags:['工作','复盘']});
    localStorage.setItem('journal.selected',JSON.stringify(id)); localStorage.setItem('journal.view',JSON.stringify(folder));
    return {id,folder,year};
  `)
  await evaluate(`location.hash='/journal'`)
  await waitFor(`!!document.querySelector('.vditor-ir [contenteditable=true]')`)
  await screenshot('implemented-desktop', 1600, 1024)
  assert.equal(
    await evaluate(`document.querySelector('.journal-title-input').value`),
    '一次沟通后的感受'
  )
  await evaluate(
    `document.querySelector('[aria-label="收起文件夹栏"]').click();document.querySelector('[aria-label="收起笔记列表"]').click()`
  )
  await waitFor(`document.querySelector('.journal-workspace').classList.contains('list-hidden')`)
  await screenshot('implemented-collapsed', 1440, 900)
  await evaluate(
    `document.querySelector('[aria-label="展开文件夹栏"]').click();document.querySelector('[aria-label="展开笔记列表"]').click()`
  )
  // edit via actual DOM input and wait for autosave
  await evaluate(
    `(()=>{const e=document.querySelector('.journal-title-input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'自动保存验证');e.dispatchEvent(new Event('input',{bubbles:true}))})()`
  )
  await waitFor(`document.querySelector('.journal-save-status').textContent==='已保存'`)
  await delay(1000)
  assert.equal(await api(`return (await window.api.journal.list()).notes[0].title`), '自动保存验证')
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('完成记录 ·')).click()`
  )
  await waitFor(`document.body.textContent.includes('已获得10成长值')`)
  assert.equal(await api('return (await window.api.march.get()).balance'), 10)
  // Exercise the real Vditor input path rather than only writing through IPC.
  await evaluate(
    `(()=>{const el=document.querySelector('.vditor-ir [contenteditable=true]');el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range)})()`
  )
  await cdp('Input.insertText', { text: ' 编辑器输入验证' })
  await waitFor(
    `(async()=> (await window.api.journal.list()).notes[0].markdown.includes('编辑器输入验证'))()`
  )
  // Real MediaRecorder using Chromium synthetic microphone, then real player metadata.
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('录一段')).click()`
  )
  await waitFor(`!!document.querySelector('.journal-recording')`)
  await delay(3500)
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('停止并保存')).click()`
  )
  await waitFor(
    `!!document.querySelector('audio') && !document.querySelector('.journal-recording')`
  )
  await waitFor(`document.querySelector('audio').readyState>=1`)
  assert.ok(await evaluate(`document.querySelector('audio').duration>0`))
  await evaluate(`document.querySelector('audio').play()`)
  await delay(200)
  assert.equal(await evaluate(`document.querySelector('audio').paused`), false)
  await evaluate(`document.querySelector('audio').pause()`)
  await screenshot('implemented-with-audio', 1600, 1024)
  await screenshot('implemented-narrow', 1100, 720)
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false
  })
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='按模板新建').click()`
  )
  await waitFor(`!!document.querySelector('[aria-label="按模板新建记录"]')`)
  assert.equal(
    await evaluate(`document.querySelectorAll('.journal-template-options button').length`),
    3
  )
  assert.ok(
    await evaluate(
      `document.querySelector('.journal-template-preview').textContent.includes('慎独：无人处是否松懈？')`
    )
  )
  await screenshot('implemented-template-picker', 1440, 1024)
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='按此模板创建').click()`
  )
  await waitFor(
    `!document.querySelector('.journal-template-modal') && document.querySelector('.journal-title-input').value.includes('管理反思复盘')`
  )
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('完成记录 ·')).click()`
  )
  await waitFor(`!!document.querySelector('.journal-error')`)
  assert.equal(await api('return (await window.api.march.get()).balance'), 10)

  await stop()
  launch()
  await connect()
  await waitFor('!!window.api?.journal')
  assert.equal(await api('return (await window.api.journal.list()).notes[0].title'), '自动保存验证')
  assert.equal(await api('return (await window.api.march.get()).balance'), 10)
  assert.equal(await api('return (await window.api.journal.list()).notes[0].attachments.length'), 1)
  assert.deepEqual(rendererErrors, [], JSON.stringify(rendererErrors))
  console.log(
    'Journal smoke passed: nested folders, offline editor, collapse/restore, autosave, growth, real MediaRecorder playback, restart persistence; screenshots saved.'
  )
} catch (error) {
  console.error(error)
  console.error('Renderer errors:', JSON.stringify(rendererErrors))
  console.error(logs.slice(-6000))
  process.exitCode = 1
} finally {
  await stop()
  await fs.rm(root, { recursive: true, force: true })
}
