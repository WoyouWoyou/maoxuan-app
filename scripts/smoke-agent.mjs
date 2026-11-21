import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const electron = createRequire(import.meta.url)('electron')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'maoxuan-agent-smoke-'))
const configPath = path.join(root, 'agent.json')
const env = {
  ...process.env,
  MAOXUAN_AGENT_CONFIG: configPath,
  MAOXUAN_USER_DATA: root,
  MAOXUAN_TEST: '1',
  ELECTRON_RENDERER_URL: ''
}
let app, socket, logs

async function waitFor(check, label) {
  for (let i = 0; i < 100; i++) {
    const result = await check()
    if (result) return result
    await delay(100)
  }
  throw new Error('等待超时 · ' + label)
}

async function launch() {
  logs = ''
  app = spawn(electron, ['.', '--remote-debugging-port=0'], {
    env,
    stdio: ['ignore', 'ignore', 'pipe']
  })
  app.stderr.on('data', (bytes) => {
    logs += bytes
  })
  const origin = await waitFor(
    () => logs.match(/DevTools listening on ws:\/\/(127\.0\.0\.1:\d+)/)?.[1],
    'Electron 调试端口'
  )
  const page = await waitFor(async () => {
    const response = await fetch(`http://${origin}/json/list`)
    return (await response.json()).find(({ type }) => type === 'page')
  }, 'Electron 页面')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await once(socket, 'open')
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', ({ data }) => {
    const reply = JSON.parse(data)
    const call = pending.get(reply.id)
    if (!call) return
    pending.delete(reply.id)
    if (reply.error) call.reject(new Error(reply.error.message))
    else call.resolve(reply.result)
  })
  return async (expression) => {
    const id = ++sequence
    const result = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
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
}

async function stopApp() {
  socket?.close()
  if (app && app.exitCode === null && app.signalCode === null) {
    const exited = once(app, 'exit')
    app.kill()
    await exited
  }
}

try {
  let evaluate = await launch()
  const api = (expression) => evaluate(`(async()=>{${expression}})()`)
  await waitFor(() => evaluate('Boolean(window.api?.agent)'), 'Agent preload')
  const project = await api("return window.api.sessions.create('验收工作台', 'workbench')")
  await evaluate("location.hash='/settings'")
  await waitFor(
    () =>
      evaluate(`(() => {
    const button = document.querySelector('section[aria-label="Agent 访问"] button')
    if (button?.textContent !== '开启 Agent 访问') return false
    button.click()
    return true
  })()`),
    '设置中的 Agent 访问开关'
  )
  // Use the same Python client shipped with the skill against the real desktop app.
  const skillClient = (...args) =>
    JSON.parse(
      execFileSync('python3', ['.agents/skills/maoxuan-workbench/scripts/maoxuan.py', ...args], {
        encoding: 'utf8',
        env: { ...process.env, MAOXUAN_AGENT_CONFIG: path.join(root, 'agent.json') },
        timeout: 10000
      })
    )
  const agent = await waitFor(async () => {
    const status = await api('return window.api.agent.status()')
    return status.running && status
  }, 'Agent 访问已开启')
  assert.equal((await fetch(agent.url + '/v1/workbenches')).status, 403)
  const config = JSON.parse(await fs.readFile(path.join(root, 'agent.json'), 'utf8'))
  assert.equal(
    (
      await fetch(agent.url + '/v1/workbenches', {
        headers: { origin: 'https://example.com', authorization: 'Bearer ' + config.token }
      })
    ).status,
    403
  )
  assert.ok(skillClient('workbenches').workbenches.some(({ id }) => id === project.id))
  const linked = [
    'add',
    '--request-id',
    'smoke-linked',
    '--text',
    'Agent 验收任务',
    '--due-date',
    '2026-11-27T09:30',
    '--quadrant',
    'plan',
    '--session-id',
    project.id
  ]
  const firstReceipt = skillClient(...linked)
  const replay = skillClient(...linked)
  assert.equal(firstReceipt.created, true)
  assert.deepEqual(replay, { created: false, action: firstReceipt.action })
  const rejectsChange = await fetch(agent.url + '/v1/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + config.token },
    body: JSON.stringify({ requestId: 'smoke-linked', text: '不同任务' })
  })
  assert.equal(rejectsChange.status, 409)
  const invalidDate = await fetch(agent.url + '/v1/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + config.token },
    body: JSON.stringify({
      requestId: 'smoke-invalid-date',
      text: '无效日期',
      dueDate: '2026-02-30'
    })
  })
  assert.equal(invalidDate.status, 400)
  const latest = await api(`return window.api.sessions.get('${project.id}')`)
  const saved = latest.data.workbench.actions.filter(
    (action) => action.id === replay.action.actionId
  )
  assert.equal(saved.length, 1)
  assert.equal(saved[0].planningState, 'queued')
  assert.equal(saved[0].dueDate, '2026-11-27T09:30')
  const standalone = skillClient('add', '--request-id', 'smoke-default', '--text', 'Agent 日常待办')
  assert.equal(standalone.action.sessionId, null)
  assert.ok(
    (await api('return window.api.actions.list()')).some(
      ({ id }) => id === standalone.action.actionId
    )
  )
  await evaluate("location.hash='/actions'")
  await waitFor(() => evaluate("Boolean(document.querySelector('.actions-toolbar'))"), '工作清单')
  skillClient('add', '--request-id', 'smoke-live', '--text', '实时刷新验收', '--quadrant', 'do')
  let shown = false
  for (let i = 0; i < 30 && !shown; i++) {
    shown = await evaluate("document.body.innerText.includes('实时刷新验收')")
    if (!shown) await delay(100)
  }
  assert.ok(shown, 'Agent 新增任务应即时出现在已打开的工作清单')
  assert.equal((await api('return window.api.agent.stop()')).running, false)
  await assert.rejects(fs.stat(path.join(root, 'agent.json')), { code: 'ENOENT' })
  await api('return window.api.agent.start()')
  assert.deepEqual(skillClient(...linked), replay)
  assert.equal(
    (
      await fetch(agent.url + '/v1/workbenches', {
        headers: { authorization: 'Bearer ' + config.token }
      })
    ).status,
    403
  )
  await api('return window.api.agent.stop()')

  await stopApp()
  evaluate = await launch()
  await waitFor(() => evaluate('Boolean(window.api?.agent)'), '重启后 Agent preload')
  assert.equal((await api('return window.api.agent.status()')).running, false)
  await api('return window.api.agent.start()')
  assert.deepEqual(skillClient(...linked), replay)
  await api('return window.api.agent.stop()')
  console.log(
    'Agent smoke passed: UI toggle, authentication, both task destinations, live refresh and durable retries.'
  )
} catch (error) {
  console.error(logs)
  throw error
} finally {
  await stopApp()
  await fs.rm(root, { recursive: true, force: true })
}
