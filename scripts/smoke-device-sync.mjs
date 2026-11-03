import {request as httpsRequest} from 'node:https'
import {createHash} from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'maoxuan-smoke-'))
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const launchApp = () =>
  spawn(require('electron'), ['.', '--remote-debugging-port=9433'], {
    env: { ...process.env, MAOXUAN_USER_DATA: root, MAOXUAN_TEST: '1', ELECTRON_RENDERER_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
let logs = ''
const collectLogs = (proc) => {
  proc.stderr.on('data', (b) => {
    logs += b
  })
  proc.stdout.on('data', (b) => {
    logs += b
  })
}
let app = launchApp()
collectLogs(app)
let socket
/** 连接调试端口；重启后复用同一套连接逻辑验证持久化。 */
const connect = async () => {
  let targets
  for (let i = 0; i < 80; i++) {
    try {
      targets = await (await fetch('http://127.0.0.1:9433/json')).json()
      if (targets.find((t) => t.type === 'page')) break
    } catch {}
    await delay(250)
  }
  const page = targets?.find((t) => t.type === 'page')
  if (!page) throw new Error('Electron did not start: ' + logs)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let sequence = 0
  const pendingCalls = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id) {
      const p = pendingCalls.get(msg.id)
      pendingCalls.delete(msg.id)
      msg.error ? p?.reject(new Error(msg.error.message)) : p?.resolve(msg.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pendingCalls.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { socket: ws, cdp: send }
}
try {
  const first = await connect()
  socket = first.socket
  const cdp = first.cdp
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const waitFor = async (check, label, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const value = await check()
      if (value) return value
      await delay(125)
    }
    throw new Error('Timed out waiting for ' + label)
  }
  const api = (expr) => evaluate(`(async()=>{${expr}})()`)
  await delay(500)
  assert.equal((await api('return await window.api.library.list()'))[0].chapters, 388)
  // Exercise the actual preload -> main -> HTTPS -> SQLite path with isolated test data.
  assert.equal((await api('return await window.api.sync.status()')).running, false)
  const firstPair = JSON.parse((await api('return await window.api.sync.start()')).pairing[0])
  await api('return await window.api.sync.stop()')
  const secondPair = JSON.parse((await api('return await window.api.sync.start()')).pairing[0])
  assert.equal(secondPair.fingerprint, firstPair.fingerprint)
  assert.notEqual(secondPair.token, firstPair.token)
  const postSync = (token, body) => new Promise((resolve, reject) => {
    const req = httpsRequest(secondPair.url, {method:'POST',rejectUnauthorized:false,headers:{authorization:'Bearer '+token}}, res => {
      const peer = res.socket.getPeerCertificate()
      assert.equal(createHash('sha256').update(peer.raw).digest('hex'), secondPair.fingerprint)
      let text='';res.on('data', chunk => text+=chunk);res.on('end',()=>resolve({code:res.statusCode,body:JSON.parse(text)}))
    });req.on('error',reject);req.end(JSON.stringify(body))
  })
  assert.equal((await postSync(firstPair.token,{protocol:2,changes:[]})).code,403)
  const syncNote={id:'lan-smoke-note',title:'局域网联调',markdown:'手机离线记录',tags:[],folderId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),completedAt:null,deleted:false,source:'local',revision:1,attachments:[]}
  const upload=await postSync(secondPair.token,{protocol:2,changes:[{document:{kind:'note',id:syncNote.id,value:syncNote},base:null}]})
  assert.equal(upload.code,200)
  const importedNote=(await api('return await window.api.journal.list()')).notes.find(n=>n.id===syncNote.id)
  assert.equal(importedNote.markdown,'手机离线记录')
  await api(`return await window.api.journal.apply(${JSON.stringify({kind:'noteSave',id:syncNote.id,revision:importedNote.revision,title:'局域网联调',markdown:'电脑修改后回传',tags:[]})})`)
  const pulled=await postSync(secondPair.token,{protocol:2,changes:[]})
  assert.equal(pulled.body.documents.find(d=>d.id===syncNote.id).value.markdown,'电脑修改后回传')
  const mediaBytes = Buffer.alloc(600000, 7)
  mediaBytes.write('RIFF', 0); mediaBytes.write('WAVE', 8)
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const manifests = [
    {id:crypto.randomUUID(),name:'录音.wav',mime:'audio/wav',size:mediaBytes.length},
    {id:crypto.randomUUID(),name:'照片.png',mime:'image/png',size:imageBytes.length}
  ]
  const before=(await postSync(secondPair.token,{protocol:2,changes:[]})).body.documents.find(d=>d.id===syncNote.id)
  const digest=v=>createHash('sha256').update(v).digest('hex')
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)
  const withMedia=structuredClone(before);withMedia.value.attachments=manifests
  assert.equal((await postSync(secondPair.token,{protocol:2,changes:[{document:withMedia,base:digest(canonical(before))}]})).code,200)
  assert.equal((await postSync(secondPair.token,{operation:'asset-read',id:crypto.randomUUID(),offset:0})).code,400)
  for(const [i,bytes] of [mediaBytes,imageBytes].entries()){
    const id=manifests[i].id,sha256=digest(bytes)
    assert.equal((await postSync(secondPair.token,{operation:'asset-probe',id})).body.exists,false)
    if(i===1){
      assert.equal((await postSync(secondPair.token,{operation:'asset-write',id,offset:0,total:bytes.length,sha256:'0'.repeat(64),data:bytes.toString('base64')})).code,400)
      assert.equal((await postSync(secondPair.token,{operation:'asset-probe',id})).body.exists,false)
    }
    for(let offset=0;offset<bytes.length;offset+=393216){
      const part=await postSync(secondPair.token,{operation:'asset-write',id,offset,total:bytes.length,sha256,data:bytes.subarray(offset,offset+393216).toString('base64')})
      assert.equal(part.code,200)
    }
    assert.equal((await postSync(secondPair.token,{operation:'asset-probe',id})).body.sha256,sha256)
    const loaded=await api(`return Array.from((await window.api.journal.media('${id}')).bytes)`)
    assert.equal(digest(Buffer.from(loaded)),sha256)
    let chunks=[]
    for(let offset=0;offset<bytes.length;){
      const part=await postSync(secondPair.token,{operation:'asset-read',id,offset})
      assert.equal(part.code,200);assert.equal(part.body.offset,offset)
      const chunk=Buffer.from(part.body.data,'base64');chunks.push(chunk);offset+=chunk.length
    }
    assert.equal(digest(Buffer.concat(chunks)),sha256)
  }
  console.log('PASS: actual Electron preload, HTTPS authentication, note metadata, image/audio upload/download, checksum rejection and persisted media bytes')
  await api('return await window.api.sync.stop()')
} catch (e) {
  console.error(e)
  console.error(logs.slice(-2500))
  process.exitCode = 1
} finally {
  socket?.close()
  app.kill('SIGTERM')
}
