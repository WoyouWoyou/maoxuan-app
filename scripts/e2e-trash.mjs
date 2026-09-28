import fs from 'node:fs'

const shots = '.codegen/shots'
fs.mkdirSync(shots, { recursive: true })
const t = await (await fetch('http://127.0.0.1:9333/json')).json()
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
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
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
const clickText = (scope, text) =>
  ev(`(()=>{const b=[...document.querySelectorAll('${scope} button')].find(b=>b.textContent.includes(${JSON.stringify(text)})); if(!b) return false; b.click(); return true})()`)

const TITLE = 'E2E回收站测试问题，请忽略'
const s = await api(`window.api.sessions.create(${JSON.stringify(TITLE)})`)
await ev(`window.dispatchEvent(new Event('sessions-changed')); location.hash='#/session/${s.id}'; true`)
await sleep(1200)

// 1. 侧栏 × → 弹窗
const hasClose = await ev(`!!document.querySelector('.sb-item.active .sb-item-close')`)
check(hasClose, '当前会话显示关闭按钮 ×')
await ev(`document.querySelector('.sb-item.active .sb-item-close').click(); true`)
await sleep(400)
const dlg = await ev(`(()=>{const d=document.querySelector('.csd-card'); if(!d) return null; const bg=s=>getComputedStyle(d.querySelector(s)).backgroundColor; return {text:d.innerText, trash:bg('.csd-btn-trash'), archive:bg('.csd-btn-archive')}})()`)
check(!!dlg && dlg.text.includes(TITLE.slice(0, 10)), '弹窗显示问题标题')
console.log('  按钮底色：回收站', dlg?.trash, '归档', dlg?.archive)
await shot('70-close-dialog')

// 2. 取消
await clickText('.csd-card', '取消')
await sleep(300)
check(!(await ev(`!!document.querySelector('.csd-card')`)), '取消后弹窗关闭')
check((await api('window.api.sessions.list()')).some((x) => x.id === s.id), '取消后仍在列表')

// 3. 归档
await ev(`document.querySelector('.sb-item.active .sb-item-close').click(); true`)
await sleep(300)
await clickText('.csd-card', '归档')
await sleep(800)
check(!(await api('window.api.sessions.list()')).some((x) => x.id === s.id), '归档后从侧栏消失')
check((await api('window.api.sessions.listArchived()')).some((x) => x.id === s.id), '出现在已归档')
await sleep(600)
const hashAfter = await ev('location.hash')
check(!hashAfter.includes(s.id), `关闭当前问题后离开该页（现在：${hashAfter}）`)

// 4. 设置页：已归档 → 移入回收站
await ev(`location.hash='#/settings'; true`)
await sleep(1000)
await ev(`document.querySelector('.tp-wrap').scrollIntoView({block:'start'}); true`)
await sleep(300)
await shot('71-settings-archived')
await ev(`(()=>{const row=[...document.querySelectorAll('.tp-row')].find(r=>r.innerText.includes('E2E回收站')); [...row.querySelectorAll('button')].find(b=>b.textContent.includes('移入回收站')).click(); return true})()`)
await sleep(800)
const trash = await api('window.api.sessions.listTrash()')
const item = trash.find((x) => x.id === s.id)
check(!!item && !!item.deletedAt, '移入回收站，deletedAt 已写入')
const rowText = await ev(`[...document.querySelectorAll('.tp-row')].find(r=>r.innerText.includes('E2E回收站'))?.innerText ?? ''`)
check(rowText.includes('剩余') && rowText.includes('30'), `回收站行显示剩余天数：${rowText.replace(/\n/g, ' | ')}`)
await shot('72-settings-trash')

// 5. 恢复 → 回到已归档（保留原状态）
await ev(`(()=>{const row=[...document.querySelectorAll('.tp-row')].find(r=>r.innerText.includes('E2E回收站')&&r.innerText.includes('剩余')); [...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='恢复').click(); return true})()`)
await sleep(800)
check((await api('window.api.sessions.listArchived()')).some((x) => x.id === s.id), '恢复后回到已归档')

// 6. 取消归档 → 回到侧栏；再从侧栏移入回收站；彻底删除
await ev(`(()=>{const row=[...document.querySelectorAll('.tp-row')].find(r=>r.innerText.includes('E2E回收站')); [...row.querySelectorAll('button')].find(b=>b.textContent.includes('取消归档')).click(); return true})()`)
await sleep(800)
check((await api('window.api.sessions.list()')).some((x) => x.id === s.id), '取消归档后回到侧栏')
await ev(`(()=>{const it=[...document.querySelectorAll('.sb-item')].find(i=>i.innerText.includes('E2E回收站')); it.querySelector('.sb-item-close').click(); return true})()`)
await sleep(300)
await clickText('.csd-card', '移入回收站')
await sleep(800)
check((await api('window.api.sessions.listTrash()')).some((x) => x.id === s.id), '侧栏弹窗：移入回收站')
await ev(`(()=>{const row=[...document.querySelectorAll('.tp-row')].find(r=>r.innerText.includes('E2E回收站')); [...row.querySelectorAll('button')].find(b=>b.textContent.includes('彻底删除')).click(); return true})()`)
await sleep(300)
await ev(`(()=>{const row=[...document.querySelectorAll('.tp-row')].find(r=>r.innerText.includes('E2E回收站')); [...row.querySelectorAll('button')].find(b=>b.textContent.trim()==='删除').click(); return true})()`)
await sleep(800)
check((await api(`window.api.sessions.get('${s.id}')`)) === null, '彻底删除后数据库中已不存在')

ws.close()
