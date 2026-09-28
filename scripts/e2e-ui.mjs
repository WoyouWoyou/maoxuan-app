#!/usr/bin/env node
// UI-click smoke test against a running app (`npx electron . --remote-debugging-port=9333`).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = path.join(ROOT, '.codegen', 'shots')
const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9333}/json`)).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) return pending.get(m.id)(m), pending.delete(m.id)
  if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300))
})
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (text) => ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}) && !b.disabled); if (b) b.click(); return !!b })()`)
const waitFor = async (expr, ms = 180000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return (Date.now() - t) / 1000; await sleep(500) } throw new Error('timeout: ' + expr) }
const setValue = (selector, value) => ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return true })()`)
async function shot(name) { await sleep(800); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('  shot', name) }

await send('Runtime.enable')
await ev('location.hash = "#/library"; true')
await sleep(800)
console.log('library count text:', await ev(`document.body.innerText.match(/共 \\d+ 篇/)?.[0]`))

console.log('create session via sidebar')
await click('我有一个头疼的问题')
await sleep(300)
await setValue('.sidebar textarea, aside textarea', '团队里三个项目同时延期，老板天天催，我不知道先救哪个')
await sleep(200)
const created = await ev(`(() => { const b = [...document.querySelectorAll('.sidebar button, aside button')].find(b => /创建|开始|确定|提交/.test(b.textContent) && !b.disabled); if (b) b.click(); return b?.textContent })()`)
console.log('  submit button:', created)
await waitFor(`location.hash.startsWith('#/session/')`, 10000)
console.log('  at', await ev('location.hash'))

console.log('step 1: diagnose via button')
await click('请教练诊断')
console.log(`  diagnosis card after ${await waitFor(`!!document.querySelector('.problem-diagnosis')`)}s`)
await shot('11-ui-diagnosis')
await click('确认问题，进入第二步')
await waitFor(`!!document.querySelector('.step-focus')`, 10000)

console.log('step 2: find passages via button')
await waitFor(`!!document.querySelector('.step-focus-reader p')`, 20000)
await click('帮我找到该读的段落')
console.log(`  marks after ${await waitFor(`document.querySelectorAll('.reader-mark').length > 0`)}s, count=${await ev(`document.querySelectorAll('.reader-mark').length`)}`)
await ev(`document.querySelector('.reader-mark')?.scrollIntoView({block:'center'}); true`)
await shot('12-ui-passages')

console.log('sidebar badge:', await ev(`document.querySelector('.sidebar')?.innerText.slice(0, 200)`))
console.log('renderer errors:', errors.length ? errors : 'none')
ws.close()
