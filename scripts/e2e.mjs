#!/usr/bin/env node
// End-to-end smoke test against a running app: `npx electron . --remote-debugging-port=9333`
// Drives the real window.api (real DeepSeek calls) and saves screenshots to .codegen/shots/.
import fs from 'node:fs'
import { readingClient } from './reading-client.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = path.join(ROOT, '.codegen', 'shots')
const PORT = process.env.CDP_PORT || 9333

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let seq = 0
const pending = new Map()
const consoleLines = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleLines.push('EXCEPTION ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 400))
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleLines.push(
      'console.error ' +
        msg.params.args
          .map((a) => a.value ?? a.description)
          .join(' ')
          .slice(0, 400)
    )
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (res.result?.exceptionDetails)
    throw new Error(res.result.exceptionDetails.exception?.description || 'eval failed')
  return res.result?.result?.value
}
const api = (call) =>
  evaluate(`(async () => JSON.stringify(await window.api.${call}))()`).then((v) =>
    v === undefined ? undefined : JSON.parse(v)
  )

const save = readingClient(api)

async function shot(name) {
  await new Promise((r) => setTimeout(r, 900))
  const res = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(SHOTS, { recursive: true })
  const file = path.join(SHOTS, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
  console.log('  screenshot', file)
}
const go = (hash) => evaluate(`location.hash = ${JSON.stringify(hash)}; true`)
const step = (title) => console.log(`\n== ${title}`)
const t0 = () => Date.now()
const secs = (t) => `${((Date.now() - t) / 1000).toFixed(1)}s`

await send('Runtime.enable')
await send('Page.enable')
await evaluate('location.reload(); true')
await new Promise((r) => setTimeout(r, 2000))

step('首页')
await go('#/')
await shot('01-home')

step('书库检索')
const articles = await api('articles.list()')
console.log(
  '  articles',
  articles.length,
  'core',
  articles
    .filter((a) => a.isCore)
    .map((a) => a.title)
    .join('、')
)
for (const q of ['调查', '没有调查，没有发言权', '持久战']) {
  const hits = await api(`articles.search(${JSON.stringify(q)}, 5)`)
  console.log(
    `  search「${q}」→`,
    hits.map((h) => `${h.title}｜${h.snippet.slice(0, 40)}`).slice(0, 3)
  )
}
await go('#/library')
await shot('02-library')

step('第一步：明确问题')
const problem = '我负债30万，每月工资8000，被催收电话搞得睡不着，不知道从哪下手'
let s = await api(`sessions.create(${JSON.stringify(problem)})`)
const sid = s.id
s.data.problem.background = '三张信用卡加两个网贷平台，去年开始以贷养贷，每月最低还款要9000多'
s.data.problem.tried = '找朋友借过2万、试过申请更多网贷周转，结果越滚越大'
s = await save(sid, { data: s.data })
let t = t0()
const diagnosis = await api(`ai.diagnose(${JSON.stringify(sid)})`)
console.log(`  diagnose ${secs(t)}`, JSON.stringify(diagnosis, null, 1).slice(0, 1200))
s.data.diagnosis = diagnosis
s = await save(sid, { data: s.data, currentStep: 'focus' }, '第一步：明确问题')
await go(`#/session/${sid}`)
await evaluate(
  `[...document.querySelectorAll('.stepper button, [class*=stepper] button')].find(b => b.textContent.includes('明确问题'))?.click(); true`
)
await shot('03-step1-diagnosis')

step('第二步：聚焦核心')
const rec = diagnosis.recommendations[0]
t = t0()
const found = await api(`ai.findPassages(${JSON.stringify(sid)}, ${JSON.stringify(rec.articleId)})`)
console.log(`  findPassages《${rec.title}》 ${secs(t)} focus=${found.focusQuestion}`)
for (const p of found.passages)
  console.log(
    `   [${p.paragraphIndex}] verified=${p.verified} ${p.quote.slice(0, 50)} ｜ ${p.why.slice(0, 50)}`
  )
s.data.readings.push({
  articleId: rec.articleId,
  title: rec.title,
  startedAt: new Date().toISOString(),
  focusQuestion: found.focusQuestion,
  passages: found.passages,
  readDone: true,
  notes: { coreMethod: '', relatedProblem: '', action: '' },
  feedback: null,
  notesDone: false
})
s = await save(sid, { data: s.data, currentStep: 'relate' }, '第二步：精读')
await go('#/')
await go(`#/session/${sid}?focus=${rec.articleId}`)
await new Promise((r) => setTimeout(r, 1500))
await shot('04-step2-reader')

step('第三步：联系自身（先交一份空泛笔记，再交一份具体笔记）')
const weak = { coreMethod: '讲的是革命道理', relatedProblem: '我的生活', action: '以后要努力' }
t = t0()
s.data.readings[0].notes = weak
s = await save(sid, { data: s.data })
const fbWeak = await api(
  `ai.reviewNotes(${JSON.stringify(sid)}, ${JSON.stringify(rec.articleId)}, ${JSON.stringify(weak)})`
)
console.log(
  `  weak notes ${secs(t)} passed=${fbWeak.passed} scores=${JSON.stringify(fbWeak.scores)}`,
  fbWeak.comments
)
const good = {
  coreMethod: '困难不能一口吃掉，要分清阶段，先守住不再恶化，再慢慢积累反攻的本钱。',
  relatedProblem: '我想一次性借一笔大钱把30万全平掉，这是速胜论，结果越借越多。',
  action: '明晚8点前把3张卡和2个网贷的本金、利率、最低还款列成一张表，并注销一个网贷App。'
}
t = t0()
s.data.readings[0].notes = good
s = await save(sid, { data: s.data })
const fbGood = await api(
  `ai.reviewNotes(${JSON.stringify(sid)}, ${JSON.stringify(rec.articleId)}, ${JSON.stringify(good)})`
)
console.log(
  `  good notes ${secs(t)} passed=${fbGood.passed} scores=${JSON.stringify(fbGood.scores)}`,
  fbGood.comments
)
s.data.readings[0].notes = good
s.data.readings[0].feedback = fbGood
s.data.readings[0].notesDone = true
s.data.actions.push({
  id: crypto.randomUUID(),
  text: good.action,
  fromArticleId: rec.articleId,
  dueDate: '2026-09-26',
  status: 'todo',
  result: '',
  createdAt: new Date().toISOString()
})
s = await save(sid, { data: s.data, currentStep: 'apply' }, '第三步：3 条笔记')
await go('#/')
await go(`#/session/${sid}`)
await new Promise((r) => setTimeout(r, 800))
await evaluate(
  `[...document.querySelectorAll('button')].find(b => b.textContent.includes('联系自身'))?.click(); true`
)
await shot('05-step3-notes')

step('第四步：反复应用')
s.data.actions[0].status = 'done'
s.data.actions[0].result = '列完了，发现网贷利率最高，先停掉了一个。'
s = await save(sid, { data: s.data }, '第四步：完成行动')
t = t0()
const review = await api(
  `ai.reviewSituation(${JSON.stringify(sid)}, '公司通知下个月降薪20%，原来的还款计划排不开了')`
)
console.log(
  `  reviewSituation ${secs(t)} reread=${review.rereadArticleIds.join(',')}\n  advice: ${review.advice.slice(0, 300)}`
)
t = t0()
const mind = await api(`ai.mindset(${JSON.stringify(sid)})`)
console.log(`  mindset ${secs(t)}`, mind)
s.data.reviews.push(review)
s.data.mindset = mind
s = await save(sid, { data: s.data }, '第四步：心法三问')
await go('#/')
await go(`#/session/${sid}`)
await shot('06-step4-apply')

step('教练对话（流式）')
t = t0()
const chatResult = await evaluate(`(async () => {
  const sid = ${JSON.stringify(sid)}
  let chunks = 0
  const done = new Promise((resolve, reject) => {
    const offC = window.api.chat.onChunk(() => chunks++)
    const offD = window.api.chat.onDone(e => { offC(); offD(); resolve(e.message.content) })
    window.api.chat.onError(e => reject(new Error(e.error)))
  })
  await window.api.chat.send(sid, '我明天第一步该干什么？', ${JSON.stringify(rec.articleId)})
  const content = await done
  return JSON.stringify({ chunks, content })
})()`).then(JSON.parse)
console.log(`  chat ${secs(t)} chunks=${chatResult.chunks}\n  ${chatResult.content.slice(0, 300)}`)
await go('#/')
await go(`#/session/${sid}`)
await new Promise((r) => setTimeout(r, 1200))
await shot('07-chat')

step('版本历史与恢复')
const versions = await api(`versions.list(${JSON.stringify(sid)})`)
console.log('  versions', versions.map((v) => `v${v.versionNo}:${v.label}`).join(' | '))
const v1 = versions.find((v) => v.versionNo === 1)
const restored = await api(
  `versions.restore(${JSON.stringify(v1.id)},${(await api(`sessions.get(${JSON.stringify(sid)})`)).stateVersion})`
)
const after = await api(`versions.list(${JSON.stringify(sid)})`)
console.log(
  `  restore v1 → step=${restored.currentStep} readings=${restored.data.readings.length} newest=${after[0].label} total=${after.length}`
)
const latestFull = after.find((v) => v.label === '第四步：心法三问')
await api(
  `versions.restore(${JSON.stringify(latestFull.id)},${(await api(`sessions.get(${JSON.stringify(sid)})`)).stateVersion})`
)
await go('#/')
await go(`#/session/${sid}`)
await new Promise((r) => setTimeout(r, 800))
await evaluate(
  `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '版本历史')?.click(); true`
)
await new Promise((r) => setTimeout(r, 500))
await evaluate(
  `(document.querySelectorAll('[class*=ver-item], [class*=ver-row], .ver-list > *')[2])?.click(); true`
)
await shot('08-versions')

await go('#/settings')
await shot('09-settings')

console.log('\n== renderer errors:', consoleLines.length ? consoleLines : 'none')
console.log('SESSION_ID', sid)
ws.close()
