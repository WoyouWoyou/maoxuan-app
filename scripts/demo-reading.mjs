// 录视频用的阅读法演示：PHASE=1 诊断 + 选段；PHASE=2（SID=…）写感悟、笔记、行动、复盘、心法、对话。
// 内容来自 DEMO=scripts/demo/xxx.json。
import fs from 'node:fs'
import { readingClient } from './reading-client.mjs'

const DEMO = JSON.parse(fs.readFileSync(process.env.DEMO, 'utf8'))
const PHASE = process.env.PHASE ?? '1'
const shots = '.codegen/shots'
fs.mkdirSync(shots, { recursive: true })
const t = await (await fetch(`http://127.0.0.1:${process.env.PORT ?? 9333}/json`)).json()
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
const ev = async (x) => {
  const r = await send('Runtime.evaluate', {
    expression: x,
    awaitPromise: true,
    returnByValue: true
  })
  if (r.result.exceptionDetails)
    throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result.result.value
}
const api = (expr) =>
  ev(`(async()=>JSON.stringify(await window.api.${expr}))()`).then((v) =>
    v === undefined ? undefined : JSON.parse(v)
  )
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  await sleep(900)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${shots}/${DEMO.shotPrefix}${name}.png`, Buffer.from(r.result.data, 'base64'))
}
const J = JSON.stringify
const retry = async (label, fn) => {
  for (let i = 0; ; i++) {
    const t0 = Date.now()
    try {
      const v = await fn()
      console.log(`  …${label}：${Math.round((Date.now() - t0) / 1000)}s`)
      return v
    } catch (e) {
      if (i >= 2) throw e
      console.log(`  ${label} 失败，重试：${String(e.message).slice(0, 120)}`)
    }
  }
}
const open = async (sid, hash = '') => {
  await ev(`window.dispatchEvent(new Event('sessions-changed')); location.hash='#/'; true`)
  await sleep(500)
  await ev(`location.hash='#/session/${sid}${hash}'; true`)
  await sleep(1500)
}
const save = readingClient(api)
const now = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60000).toISOString()

if (PHASE === '1') {
  const all = [
    ...(await api('sessions.list()')),
    ...(await api('sessions.listArchived()')),
    ...(await api('sessions.listTrash()'))
  ]
  for (const x of all.filter((x) => x.title === DEMO.problem.text))
    await api(`sessions.remove(${J(x.id)})`)

  let s = await api(`sessions.create(${J(DEMO.problem.text)})`)
  s.data.problem = DEMO.problem
  s = await save(s.id, { data: s.data })
  const diagnosis = await retry('诊断', () => api(`ai.diagnose(${J(s.id)})`))
  console.log(J(diagnosis, null, 1))
  s.data.diagnosis = diagnosis
  s = await save(s.id, { data: s.data, currentStep: 'focus' }, '第一步：明确问题')

  const rec = diagnosis.recommendations[0]
  const found = await retry(`选段《${rec.title}》`, () =>
    api(`ai.findPassages(${J(s.id)}, ${J(rec.articleId)})`)
  )
  s.data.readings.push({
    articleId: rec.articleId,
    title: rec.title,
    startedAt: now(),
    focusQuestion: found.focusQuestion,
    passages: found.passages,
    reflections: [],
    readDone: false,
    notes: { coreMethod: '', relatedProblem: '', action: '' },
    feedback: null,
    notesDone: false
  })
  s = await save(s.id, { data: s.data }, '第二步：找出关键段落')
  console.log(`\n聚焦问题：${found.focusQuestion}`)
  for (const p of found.passages)
    console.log(`[${p.paragraphIndex}] ${p.verified ? '' : '(未核对) '}${p.quote}\n    ↳ ${p.why}`)
  await open(s.id)
  await shot('r1-diagnosis')
  console.log('SESSION', s.id)
} else {
  const sid = process.env.SID
  let s = await api(`sessions.get(${J(sid)})`)
  const r = s.data.readings[0]
  const P2 = DEMO.phase2
  r.reflections = P2.reflections.map((x, i) => {
    const p = r.passages[x.passage]
    return {
      id: crypto.randomUUID(),
      paragraphIndex: p.paragraphIndex,
      quote: p.quote,
      text: x.text,
      createdAt: now(i)
    }
  })
  r.readDone = true
  s = await save(sid, { data: s.data, currentStep: 'relate' }, '第二步：读完')
  await open(sid, `?focus=${r.articleId}`)
  await shot('r2-reader')

  s.data.readings[0].notes = P2.notes
  s = await save(sid, { data: s.data })
  const fb = await retry('批改笔记', () =>
    api(`ai.reviewNotes(${J(sid)}, ${J(r.articleId)}, ${J(P2.notes)})`)
  )
  console.log('批改：', J(fb, null, 1))
  s = await api(`sessions.get(${J(sid)})`)
  Object.assign(s.data.readings[0], { notes: P2.notes, feedback: fb, notesDone: true })
  s.data.actions = P2.actions.map((a, i) => ({
    id: crypto.randomUUID(),
    text: a.text,
    fromArticleId: r.articleId,
    dueDate: a.dueDate,
    status: a.status,
    result: a.result ?? '',
    progress: (a.progress ?? []).map((text, j) => ({
      id: crypto.randomUUID(),
      text,
      createdAt: now(10 + i * 5 + j)
    })),
    createdAt: now(i)
  }))
  s = await save(sid, { data: s.data, currentStep: 'apply' }, '第三步：3 条笔记')
  await open(sid)
  await ev(
    `[...document.querySelectorAll('.stepper button')].find(b=>b.textContent.includes('联系自身'))?.click(); true`
  )
  await shot('r3-notes')

  s = await save(sid, { data: s.data }, '第四步：完成行动')
  const review = await retry('新情况复盘', () =>
    api(`ai.reviewSituation(${J(sid)}, ${J(P2.newSituation)})`)
  )
  console.log('复盘：', review.advice)
  s = await api(`sessions.get(${J(sid)})`)
  s.data.reviews.push(review)
  s = await save(sid, { data: s.data }, '第四步：复盘新情况')
  const mind = await retry('心法三问', () => api(`ai.mindset(${J(sid)})`))
  console.log('心法：', J(mind, null, 1))
  s = await api(`sessions.get(${J(sid)})`)
  s.data.mindset = mind
  s = await save(sid, { data: s.data }, '第四步：心法三问')

  await retry('教练对话', async () => {
    await api(`chat.send(${J(sid)}, ${J(P2.chat)}, ${J(r.articleId)})`)
    for (let i = 0; i < 120; i++) {
      await sleep(1500)
      const msgs = await api(`chat.list(${J(sid)})`)
      const a = msgs.filter((m) => m.role === 'assistant').at(-1)
      if (a) return console.log('教练：', a.content.slice(0, 400))
    }
    throw new Error('教练无回应')
  })
  await open(sid)
  await shot('r4-apply')
  const versions = await api(`versions.list(${J(sid)})`)
  console.log(
    '版本：',
    versions
      .map((v) => `v${v.versionNo} ${v.label}`)
      .reverse()
      .join(' / ')
  )
  console.log('SESSION', sid)
}
ws.close()
