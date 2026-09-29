import fs from 'node:fs'

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
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${shots}/${name}.png`, Buffer.from(r.result.data, 'base64'))
}
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) process.exitCode = 1
}
const api = (expr) => ev(`(async()=>JSON.stringify(await ${expr}))()`).then((v) => (v === undefined ? undefined : JSON.parse(v)))
const click = (text, scope = '.sp-main') =>
  ev(`(()=>{const b=[...document.querySelectorAll('${scope} button')].find(b=>b.textContent.includes(${JSON.stringify(text)}) && !b.disabled); if(!b) return false; b.click(); return true})()`)
const clickTab = (text) =>
  ev(`(()=>{const b=[...document.querySelectorAll('.sp-step button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)})); if(!b) return false; b.click(); return true})()`)
const waitFor = async (expr, label, timeout = 240000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await ev(expr)) {
      console.log(`  …${label}：${Math.round((Date.now() - t0) / 1000)}s`)
      return true
    }
    await sleep(1500)
  }
  console.log(`  …${label}：超时`)
  return false
}
const wbOf = async (sid) => (await api(`window.api.sessions.get('${sid}')`)).data.workbench
const scrollTop = () => ev(`(()=>{document.querySelectorAll('.sp-step, .sp-step *').forEach(el=>{if(el.scrollTop) el.scrollTop=0}); return true})()`)
const errors = () => ev(`[...document.querySelectorAll('.sp-main .error-text')].map(e=>e.textContent).join(' | ')`)

const DEMO = process.env.DEMO ? JSON.parse(fs.readFileSync(process.env.DEMO, 'utf8')) : null
const P = DEMO?.shotPrefix ?? ''
const OBJECTIVE = DEMO?.objective ?? '示例：三个月内把 AI 客服从一个试点组推到全公司 5 个客服组'
const isMine = (x) => (DEMO ? x.title === OBJECTIVE : x.title.startsWith('示例：'))
const RESUME =
  process.env.SID ??
  (process.env.RESUME ? (await api('window.api.sessions.list()')).find(isMine)?.id : undefined)
console.log(RESUME ? `接着测已有的示例项目 ${RESUME}` : '新建示例项目')
if (!RESUME) {
  const all = [...(await api('window.api.sessions.list()')), ...(await api('window.api.sessions.listArchived()')), ...(await api('window.api.sessions.listTrash()'))]
  for (const x of all.filter(isMine)) await api(`window.api.sessions.remove('${x.id}')`)
  console.log('  清掉旧示例项目：', all.filter(isMine).length, '个')
}
const s = RESUME ? await api(`window.api.sessions.get('${RESUME}')`) : await api(`window.api.sessions.create(${JSON.stringify(OBJECTIVE)}, 'workbench')`)
if (!RESUME) {
check(s.mode === 'workbench' && s.currentStep === 'wb_intake', `创建工作台会话（mode=${s.mode}, step=${s.currentStep}）`)

const wb0 = s.data.workbench
wb0.form = { ...wb0.form, ...(DEMO?.form ?? {
  projectName: 'AI 客服推广',
  timeScale: '90天',
  stage: '攻坚',
  blockers: ['试点组用了两个月，其他 4 个组长都不愿意接', 'AI 回答错误时没人兜底，客户投诉过 3 次', 'IT 只给了 1 个兼职工程师'],
  background: '我是客服中心的运营主管，AI 客服是我去年底提出来的，老板同意先在一个组试点。',
  knownFacts: '试点组 12 人，两个月里 AI 接了 38% 的咨询，人均日处理量从 60 单升到 85 单。另外 4 个组共 50 人。投诉 3 次都是退款政策答错。预算已批 20 万，到年底。',
  opponents: '二组、三组组长，担心考核被 AI 拉低',
  allies: '试点组组长、分管副总',
  swing: '质检部、IT 部门'
}) }
await api(`window.api.sessions.update('${s.id}', { data: ${JSON.stringify({ ...s.data, workbench: wb0 })} })`)
await ev(`window.dispatchEvent(new Event('sessions-changed')); location.hash='#/session/${s.id}'; true`)
await sleep(1500)
check(await ev(`!!document.querySelector('.stepper') && document.querySelector('.stepper').innerText.includes('摸清事实')`), '工作台步骤条显示「摸清事实」')
check(await ev(`[...document.querySelectorAll('.sb-item.active .badge')].some(b=>b.textContent.includes('工作台'))`), '侧栏显示「工作台」徽标')
await shot(P + '80-wb-intake-form')

// ---------- 第一步 ----------
check(await click('整理事实台账'), '点击「整理事实台账」')
await waitFor(`document.querySelectorAll('.wb-fact').length > 0 || [...document.querySelectorAll('.sp-main .error-text')].length > 0`, '事实台账')
let wb = await wbOf(s.id)
console.log('  错误：', await errors())
check(wb.intake && wb.intake.facts.length >= 5, `事实台账 ${wb.intake?.facts.length} 条（事实 ${wb.intake?.facts.filter((f) => f.kind === 'fact').length}／判断 ${wb.intake?.facts.filter((f) => f.kind === 'judgment').length}／愿望 ${wb.intake?.facts.filter((f) => f.kind === 'wish').length}）`)
check(wb.intake?.facts.every((f, i, a) => /^F\d+$/.test(f.id) && a.findIndex((x) => x.id === f.id) === i), '事实编号格式正确且不重复')
check(wb.ledger.length === 1 && wb.ledger[0].inputType === 'new', '台账追加了一条「新建」记录，保留原始输入')
console.log('  追问：', wb.intake?.questions.map((q) => q.question))
await scrollTop()
await shot(P + '81-wb-intake-facts')

const oldIds = wb.intake.facts.map((f) => f.id)
if (process.env.STOP === 'intake') {
  wb.intake.questions.forEach((q, i) => console.log(`  Q${i}: ${q.question}`))
  console.log('SESSION', s.id)
  process.exit(0)
}
const answers = DEMO?.answers ?? ['四个组长的考核指标是人均处理量和满意度，AI 接的单算在组里', '退款政策上个月改过一次，知识库没同步，已经修了', '副总说如果 90 天内再推 2 个组，明年预算翻倍']
wb.intake.questions = wb.intake.questions.map((q, i) => ({ ...q, answer: answers[i] ?? '暂时不清楚' }))
const cur = await api(`window.api.sessions.get('${s.id}')`)
await api(`window.api.sessions.update('${s.id}', { data: ${JSON.stringify({ ...cur.data, workbench: wb })} })`)
await ev(`location.hash='#/'; true`)
await sleep(600)
await ev(`location.hash='#/session/${s.id}'; true`)
await sleep(1500)
check(await click('根据补充重新整理'), '回答追问后点击「根据补充重新整理」')
const before = wb.intake.generatedAt
await waitFor(`(async()=>{const x=await window.api.sessions.get('${s.id}'); return x.data.workbench.intake.generatedAt !== ${JSON.stringify(before)}})()`, '重新整理')
wb = await wbOf(s.id)
check(oldIds.every((id) => wb.intake.facts.some((f) => f.id === id)), `旧事实编号全部保留（${oldIds.length} 条 → ${wb.intake.facts.length} 条）`)
check(wb.intake.questions.filter((q) => q.answer.trim()).length >= answers.length, '已回答的追问保留')
check(wb.ledger.length === 2 && wb.ledger[1].inputType === 'update' && wb.ledger[1].rawInput.includes('追问回答'), '台账追加「更新」，原始输入里带着追问回答')
// 新追问统一答掉，避免假设版阻塞
wb.intake.questions = wb.intake.questions.map((q) => (q.answer.trim() ? q : { ...q, answer: '暂不清楚，先按现有事实判断' }))
const cur2 = await api(`window.api.sessions.get('${s.id}')`)
await api(`window.api.sessions.update('${s.id}', { data: ${JSON.stringify({ ...cur2.data, workbench: wb })} })`)
await ev(`location.hash='#/'; true`)
await sleep(600)
await ev(`location.hash='#/session/${s.id}'; true`)
await sleep(1500)

}
let wb = await wbOf(s.id)
if (RESUME) { await ev(`location.hash='#/session/${s.id}'; true`); await sleep(1500) }
if (RESUME && process.env.FROM === 'answers') {
  wb.intake.questions = wb.intake.questions.map((q, i) => ({ ...q, answer: DEMO.answers[i] ?? '暂时不清楚' }))
  await api(`window.api.sessions.update('${s.id}', { data: ${JSON.stringify({ ...(await api(`window.api.sessions.get('${s.id}')`)).data, workbench: wb })} })`)
  await ev(`location.hash='#/'; true`)
  await sleep(600)
  await ev(`location.hash='#/session/${s.id}'; true`)
  await sleep(1500)
  await shot(P + '80b-wb-answers')
  const before = wb.intake.generatedAt
  check(await click('根据补充重新整理'), '回答追问后点击「根据补充重新整理」')
  await waitFor(`(async()=>{const x=await window.api.sessions.get('${s.id}'); return x.data.workbench.intake.generatedAt !== ${JSON.stringify(before)}})()`, '重新整理')
  wb = await wbOf(s.id)
  console.log(`  事实台账 ${wb.intake.facts.length} 条；新追问：`, wb.intake.questions.filter((q) => !q.answer.trim()).map((q) => q.question))
  wb.intake.questions = wb.intake.questions.map((q) => (q.answer.trim() ? q : { ...q, answer: '暂不清楚，先按现有事实判断' }))
  await api(`window.api.sessions.update('${s.id}', { data: ${JSON.stringify({ ...(await api(`window.api.sessions.get('${s.id}')`)).data, workbench: wb })} })`)
  await ev(`location.hash='#/'; true`)
  await sleep(600)
  await ev(`location.hash='#/session/${s.id}'; true`)
  await sleep(1500)
  await scrollTop()
  await shot(P + '81-wb-intake-facts')
}

// ---------- 第二步 ----------
check(await click('进入三路诊断'), '进入三路诊断')
await sleep(800)
const diagDone = `(async()=>{const x=(await window.api.sessions.get('${s.id}')).data.workbench.diagnosis; return !!(x.contradiction&&x.routes&&x.objSubj)})()`
const idle = `![...document.querySelectorAll('.sp-main .spinner')].length`
if (!(await ev(diagDone))) {
  check(await click('一键三路诊断'), '点击「一键三路诊断」')
  await sleep(3000)
  await waitFor(`(async()=>(await ${diagDone}) || ${idle})()`, '三路诊断')
}
for (let round = 0; round < 2 && !(await ev(diagDone)); round++) {
  const x = (await wbOf(s.id)).diagnosis
  const missing = [['contradiction', '抓主要矛盾'], ['routes', '三条路线'], ['objSubj', '主客分析']].filter(([k]) => !x[k])
  console.log('  网络失败，重试：', missing.map((m) => m[1]).join('、'), '｜', await errors())
  for (const [, tab] of missing) {
    await clickTab(tab)
    await sleep(400)
    await click('重新生成')
    await sleep(1000)
  }
  await waitFor(`(async()=>(await ${diagDone}) || ${idle})()`, '重试')
}
check(await ev(diagDone), '三路诊断全部完成')
await sleep(1500)
console.log('  错误：', await errors())
wb = await wbOf(s.id)
const d = wb.diagnosis
const factIds = new Set(wb.intake.facts.filter((f) => f.kind === 'fact').map((f) => f.id))
check(!!d.contradiction?.primary && d.contradiction.all.length >= 2, `主要矛盾：${d.contradiction?.primary}`)
check([d.contradiction, d.routes, d.objSubj].every((m) => m && m.factRefs.every((r) => factIds.has(r))), '三个模块引用的事实编号都真实存在')
check(d.routes?.routes.map((r) => r.key).join(',') === 'steady,breakthrough,defensive', '三条路线齐全且顺序正确')
check(['trend', 'resources', 'constraints', 'judgment', 'execution'].every((k) => d.objSubj[k].score >= 1 && d.objSubj[k].score <= 5), `主客分析：${['trend', 'resources', 'constraints', 'judgment', 'execution'].map((k) => d.objSubj[k].score).join('/')}，最大缺口：${d.objSubj?.biggestGap}`)
await scrollTop()
await shot(P + '82-wb-contradiction')
check(await clickTab('三条路线'), '切到「三条路线」标签')
await sleep(600)
await scrollTop()
await shot(P + '83-wb-routes')
check(await clickTab('主客分析'), '切到「主客分析」标签')
await sleep(600)
await scrollTop()
await shot(P + '84-wb-objsubj')

// 原文抽屉
check(await click('看原文依据'), '点击「看原文依据」')
await waitFor(`(document.querySelector('[class*="wsd-"]')?.innerText ?? '').includes('红色政权')`, '原文抽屉', 20000)
const drawerText = await ev(`(document.querySelector('[class*="wsd-"]')?.innerText ?? '').slice(0, 300)`)
check(drawerText.includes('红色政权'), `原文抽屉打开《中国的红色政权为什么能够存在？》`)
await sleep(800)
await shot(P + '85-wb-source-drawer')
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); true`)
await sleep(400)

// ---------- 第三步 ----------
check(await click('进入综合决策'), '进入综合决策')
await sleep(800)
check(await click('生成综合决策'), '点击「生成综合决策」')
await waitFor(`(async()=>!!(await window.api.sessions.get('${s.id}')).data.workbench.decision)()`, '综合决策 + 红队检查')
await sleep(1500)
console.log('  错误：', await errors())
wb = await wbOf(s.id)
const dec = wb.decision
check(!!dec.firstBattle && dec.notNow.length >= 1, `决策：路线=${dec.route}，先打哪一仗=${dec.firstBattle}`)
const ruleN = dec.checks.filter((c) => c.source === 'rule').length
const aiN = dec.checks.filter((c) => c.source === 'ai').length
const failN = dec.checks.filter((c) => !c.passed).length
check(ruleN >= 10 && aiN >= 1, `检查：硬规则 ${ruleN} 项、红队 ${aiN} 项、未通过 ${failN} 项`)
console.log('  未通过：', dec.checks.filter((c) => !c.passed).map((c) => `[${c.source}] ${c.message}`))
console.log('  增强模块：', dec.enhancements.map((e) => `${e.key}: ${e.point}`))
await scrollTop()
await shot(P + '86-wb-decision')

if (failN > 0) {
  check(await click('按检查意见修复'), '点击「按检查意见修复」')
  const g0 = dec.generatedAt
  await waitFor(`(async()=>(await window.api.sessions.get('${s.id}')).data.workbench.decision.generatedAt !== ${JSON.stringify(g0)})()`, '修复')
  await sleep(1200)
  wb = await wbOf(s.id)
  console.log('  修复后未通过：', wb.decision.checks.filter((c) => !c.passed).map((c) => `[${c.source}] ${c.message}`))
  console.log('  冲突修复记录：', wb.decision.conflictsFixed)
  // 余下的逐条标记已知晓
  for (let i = 0; i < 12; i++) {
    if (!(await click('已知晓，保留'))) break
    await sleep(500)
  }
}
await sleep(800)
check(await click('确认决策，进入行动'), '确认决策，进入行动')
await sleep(1500)
wb = await wbOf(s.id)
check(wb.decision.confirmed === true, '决策已确认')

// ---------- 第四步 ----------
check(await click('生成 7 / 30 / 90 天行动'), '点击「生成 7/30/90 天行动」')
await waitFor(`(async()=>(await window.api.sessions.get('${s.id}')).data.workbench.actions.length>0)()`, '行动 + 红队审核')
await sleep(1500)
console.log('  错误：', await errors())
wb = await wbOf(s.id)
const by = (h) => wb.actions.filter((a) => a.horizon === h).length
check(by('7d') > 0 && by('30d') > 0 && by('90d') > 0, `行动：7 天 ${by('7d')} 条、30 天 ${by('30d')} 条、90 天 ${by('90d')} 条`)
check(wb.actions.every((a) => a.standards.length > 0 && a.verify && a.kpi), '每条行动都有验证、执行标准和 KPI 关系')
console.log('  7 天动作：', wb.actions.filter((a) => a.horizon === '7d').map((a) => `${a.action}〔${a.standards.join('、')}〕`))
await scrollTop()
await shot(P + '87-wb-actions')

const fill = (idx, text) =>
  ev(`(()=>{const tas=[...document.querySelectorAll('.sp-main textarea')].filter(t=>/进展|事实|判断/.test((t.closest('.field')||t.parentElement).innerText)); const el=tas[${idx}]; if(!el) return false; const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true})()`)
const RECAP = DEMO?.recap ?? ['一周内访谈了二组、三组组长。二组长同意下周接入，三组长还是反对。', '人事确认：AI 接的单可以单独计量，不算进组长的人均处理量。', '原来以为组长反对是怕麻烦，其实是怕考核；主要矛盾可能要从“技术不稳”改成“考核机制”。']
const f1 = await fill(0, RECAP[0])
const f2 = await fill(1, RECAP[1])
const f3 = await fill(2, RECAP[2])
check(f1 && f2 && f3, '填写复盘三栏')
check(await click('复盘并记入台账'), '点击「复盘并记入台账」')
await waitFor(`(async()=>(await window.api.sessions.get('${s.id}')).data.workbench.ledger.length>=3)()`, '复盘')
await sleep(1500)
wb = await wbOf(s.id)
const last = wb.ledger[wb.ledger.length - 1]
check(last.inputType === 'revision' && last.rawInput.includes(RECAP[0].slice(0, 12)), `台账追加「修订」，逐字保留原始输入。结论：${last.summary}`)
const hasRediag = await ev(`document.querySelector('.sp-main').innerText.includes('回到第二步重新诊断')`)
console.log('  是否建议重新诊断：', hasRediag)
await ev(`(()=>{const el=[...document.querySelectorAll('.sp-main .card')].find(c=>c.innerText.includes('复盘纠偏')); el?.scrollIntoView({block:'start'}); return true})()`)
await sleep(600)
await shot(P + '88-wb-recap')
await ev(`(()=>{const el=[...document.querySelectorAll('.sp-main .card')].find(c=>c.innerText.includes('项目台账')); el?.scrollIntoView({block:'start'}); return true})()`)
await sleep(600)
await shot(P + '89-wb-ledger')

const ENUM_KEYS = ['key', 'route', 'horizon', 'kind', 'confidence', 'source', 'area', 'id', 'factRefs', 'generatedAt', 'status', 'createdAt', 'checks']
const blob = JSON.stringify([wb.diagnosis, wb.decision, wb.actions], (k, v) => (ENUM_KEYS.includes(k) ? undefined : v)).replace(/"[a-zA-Z]+":/g, '')
const leaks = blob.match(/\b(steady|breakthrough|defensive|constraints|resources|trend|judgment|execution|Agent [A-E])\b/g) ?? []
check(leaks.length === 0, `给人看的文字里没有英文代号${leaks.length ? '：' + [...new Set(leaks)].join('、') : ''}`)

// ---------- 参谋对话 ----------
const sent = await api(`window.api.chat.send('${s.id}', ${JSON.stringify(DEMO?.chat ?? '三组长还是反对，我下周该先找他还是先找副总？')}, null)`)
await waitFor(`(async()=>(await window.api.chat.list('${s.id}')).some(m=>m.role==='assistant'))()`, '参谋回答', 180000)
const msgs = await api(`window.api.chat.list('${s.id}')`)
const reply = msgs.find((m) => m.role === 'assistant')?.content ?? ''
check(!!sent.requestId && reply.length > 20, `参谋对话有回答（${reply.length} 字）`)
console.log('  参谋：', reply.slice(0, 160).replace(/\n/g, ' '))

// ---------- 版本 ----------
const versions = await api(`window.api.versions.list('${s.id}')`)
console.log('  版本：', versions.map((v) => `v${v.versionNo} ${v.label}`).reverse().join(' / '))
check(versions.length >= 8, `版本快照 ${versions.length} 个`)

// ---------- 阅读法回归 ----------
const list = await api('window.api.sessions.list()')
const reading = DEMO ? null : list.find((x) => x.mode === 'reading')
if (reading) {
  await ev(`location.hash='#/session/${reading.id}'; true`)
  await sleep(1500)
  check(await ev(`document.querySelector('.stepper')?.innerText.includes('明确问题') && document.querySelector('.stepper')?.innerText.includes('联系自身')`), `阅读法会话「${reading.title.slice(0, 12)}」仍是原来的四步`)
  await shot(P + '90-reading-regression')
}
await ev(`location.hash='#/session/${s.id}'; true`)
console.log('SESSION', s.id)
ws.close()
