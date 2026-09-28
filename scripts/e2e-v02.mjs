#!/usr/bin/env node
// v0.2 smoke test: reading reflections, step-3 reflection view, apply-discussion-to-step-1.
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
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) return pending.get(m.id)(m), pending.delete(m.id)
  if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300))
})
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (text, scope = 'document') => ev(`(() => { const b = [...(${scope}).querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}) && !b.disabled); b?.click(); return !!b })()`)
const waitFor = async (x, ms = 180000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return ((Date.now() - t) / 1000).toFixed(1); await sleep(500) } throw new Error('timeout: ' + x) }
const type = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
async function shot(name) { await sleep(800); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('  shot', name) }
const api = async (call) => JSON.parse(await ev(`(async () => JSON.stringify(await window.api.${call}))()`))

await send('Runtime.enable')
const sessions = await api('sessions.list()')
const target = sessions.find((s) => s.title.startsWith('我负债30万'))
const sid = target.id
await ev(`location.hash = '#/session/${sid}'; true`)
await sleep(1500)

if (process.env.ONLY !== 'revise') {
console.log('== 第二步：阅读感悟')
await click('聚焦核心', "document.querySelector('.sp-main')")
await waitFor(`!!document.querySelector('.step-focus-reader p')`, 20000)
const clickedIdx = await ev(`(() => { const b = document.querySelectorAll('.step-focus-reader p button, .step-focus-reader [class*=idx] button, .step-focus-reader button[title*="关联"]')[40]; b?.scrollIntoView({block:'center'}); b?.click(); return b?.textContent })()`)
console.log('  clicked paragraph number:', clickedIdx)
await sleep(300)
console.log('  link hint:', await ev(`document.querySelector('[class*=refl]')?.innerText.slice(0, 120)`))
await type('[class*=refl] textarea', '这段说不同性质的矛盾要用不同方法解决——我一直用“再借一笔”对付所有债，信用卡和网贷其实该分开处理。')
await click('记下', "document.querySelector('[class*=refl]') ?? document")
await waitFor(`document.querySelector('[class*=refl]')?.innerText.includes('分开处理')`, 10000)
await shot('21-step2-reflection')

console.log('== 第三步：看到感悟 + 按钮文案')
await click('联系自身', "document.querySelector('.sp-main')")
await waitFor(`!!document.querySelector('.step-relate')`, 10000)
const relateText = await ev(`document.querySelector('.step-relate').innerText`)
console.log('  shows reflection:', relateText.includes('分开处理'), '| button 请教员批改:', relateText.includes('请教员批改'), '| old text gone:', !relateText.includes('请教练批改'))
await shot('22-step3-reflections')
}

console.log('== 第一步：讨论分歧 → 套用')
await click('明确问题', "document.querySelector('.sp-main')")
await sleep(800)
await click('教练对话')
const chatDone = await ev(`(async () => {
  const done = new Promise((res, rej) => { const off = window.api.chat.onDone(e => { off(); res(true) }); window.api.chat.onError(e => rej(new Error(e.error))) })
  document.querySelector('.chat-input').focus()
  return true
})()`)
if (process.env.ONLY !== 'revise') await type('.chat-input', '我不同意诊断。我觉得主要矛盾是收入太低：工资8000撑不住，我打算下班跑外卖，每月多挣3000，先把缺口补上。阶段我觉得是刚起步，因为我今天才第一次把账理清。')
if (process.env.ONLY !== 'revise') await click('发送')
console.log(`  chat reply after ${await waitFor(`[...document.querySelectorAll('.chat-msg-assistant')].length > 0 && !document.querySelector('.chat-cursor') && !document.querySelector('.chat-bubble .spinner') && ![...document.querySelectorAll('button')].some(b => b.textContent.includes('回复中'))`, 120000)}s`)
console.log('  apply bar visible:', await ev(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('套用到第一步'))`))
await click('套用到第一步')
console.log(`  revision ready after ${await waitFor(`!!document.querySelector('[class*=rev-]') && !document.querySelector('[class*=rev-]').innerText.includes('正在整理')`, 180000)}s`)
console.log('  changes:', await ev(`document.querySelector('[class*=rev-]')?.innerText.slice(0, 700)`))
await shot('23-revise-dialog')
await click('套用选中项')
await waitFor(`![...document.querySelectorAll('button')].some(b => b.textContent.includes('套用选中项'))`, 20000)
const after = await api(`sessions.get('${sid}')`)
const versions = await api(`versions.list('${sid}')`)
console.log('  newest version:', versions[0].label, '| mainContradiction now:', after.data.diagnosis.mainContradiction.slice(0, 80))
await shot('24-after-apply')

console.log('renderer errors:', errors.length ? errors : 'none')
ws.close()
