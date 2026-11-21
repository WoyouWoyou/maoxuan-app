import { approveSmokePair, mockPairingDialog } from './smoke-sync-pairing.mjs'
import { Agent, request as httpsRequest } from 'node:https'
import { createHash } from 'node:crypto'
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
  spawn(require('electron'), ['.', '--remote-debugging-port=9433', '--inspect=127.0.0.1:9473'], {
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
  const firstPair = (await api('return await window.api.sync.start()')).device
  await api('return await window.api.sync.stop()')
  const secondPair = (await api('return await window.api.sync.start()')).device
  assert.equal(secondPair.fingerprint, firstPair.fingerprint)
  assert.notEqual(secondPair.id, firstPair.id)
  await mockPairingDialog(9473)
  const pinnedTestAgent = new Agent({ maxCachedSessions: 0 })
  const postSync = (token, body, agent = pinnedTestAgent) =>
    new Promise((resolve, reject) => {
      const req = httpsRequest(
        secondPair.url,
        {
          method: 'POST',
          agent,
          rejectUnauthorized: false,
          headers: token ? { authorization: 'Bearer ' + token } : {}
        },
        (res) => {
          const peer = res.socket.getPeerCertificate()
          if (!peer.raw || createHash('sha256').update(peer.raw).digest('hex') !== secondPair.fingerprint) {
            res.destroy()
            reject(Error('测试连接的证书与配对指纹不一致'))
            return
          }
          let text = ''
          res.on('data', (chunk) => (text += chunk))
          res.on('error', reject)
          res.on('end', () => resolve({
            code: res.statusCode, connection: res.headers.connection, body: JSON.parse(text)
          }))
        }
      )
      req.on('error', reject)
      req.end(JSON.stringify(body))
    })
  assert.equal((await postSync(undefined, { protocol: 2, changes: [] })).code, 403)
  const token = await approveSmokePair(secondPair, postSync)
  const narration = JSON.parse(await fs.readFile('resources/core-audio/v1/manifest.json', 'utf8'))
  const firstArticle = narration.articles.find((article) => article.title === '反对本本主义')
  const audioRequest = { articleId: firstArticle.id, voice: narration.voice }
  assert.equal((await postSync(undefined, { ...audioRequest, operation: 'speech-list' })).code, 403)
  const audioList = await postSync(token, { ...audioRequest, operation: 'speech-list' })
  assert.equal(audioList.code, 200)
  const firstChunk = firstArticle.paragraphs[0].chunks[0]
  assert.deepEqual(audioList.body.assets.find((asset) => asset.key === firstChunk.key), {
    key: firstChunk.key, total: firstChunk.bytes, sha256: firstChunk.sha256
  })
  const readAudio = (key) =>
    postSync(token, { ...audioRequest, operation: 'speech-read', key, offset: 0 })
  const audio = await readAudio(firstChunk.key)
  assert.equal(audio.code, 200)
  assert.equal(createHash('sha256').update(Buffer.from(audio.body.data, 'base64')).digest('hex'), firstChunk.sha256)
  assert.equal((await readAudio('0'.repeat(64))).code, 400)
  // Mimic Android's isolated TLS connections while keeping each agent alive.
  const agents = []
  try {
    const chunks = audioList.body.assets.slice(0, 76)
    assert.equal(chunks.length, 76)
    for (const { key, total, sha256 } of chunks) {
      const digest = createHash('sha256')
      let offset = 0
      while (offset < total) {
        const agent = new Agent({ keepAlive: true, maxCachedSessions: 0 })
        agents.push(agent)
        const part = await postSync(
          token, { ...audioRequest, operation: 'speech-read', key, offset }, agent
        )
        assert.equal(part.code, 200)
        assert.equal(part.connection, 'close')
        assert.equal(part.body.key, key)
        assert.equal(part.body.offset, offset)
        const bytes = Buffer.from(part.body.data, 'base64')
        assert.ok(bytes.length > 0)
        digest.update(bytes)
        offset += bytes.length
      }
      assert.equal(offset, total)
      assert.equal(digest.digest('hex'), sha256)
    }
  } finally {
    agents.forEach((agent) => agent.destroy())
  }
  const syncNote = {
    id: 'lan-smoke-note',
    title: '局域网联调',
    markdown: '手机离线记录',
    tags: [],
    folderId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    deleted: false,
    source: 'local',
    revision: 1,
    attachments: []
  }
  const upload = await postSync(token, {
    protocol: 2,
    changes: [{ document: { kind: 'note', id: syncNote.id, value: syncNote }, base: null }]
  })
  assert.equal(upload.code, 200)
  const importedNote = (await api('return await window.api.journal.list()')).notes.find(
    (n) => n.id === syncNote.id
  )
  assert.equal(importedNote.markdown, '手机离线记录')
  await api(
    `return await window.api.journal.apply(${JSON.stringify({ kind: 'noteSave', id: syncNote.id, revision: importedNote.revision, title: '局域网联调', markdown: '电脑修改后回传', tags: [] })})`
  )
  const pulled = await postSync(token, { protocol: 2, changes: [] })
  assert.equal(
    pulled.body.documents.find((d) => d.id === syncNote.id).value.markdown,
    '电脑修改后回传'
  )
  const mediaBytes = Buffer.alloc(600000, 7)
  mediaBytes.write('RIFF', 0)
  mediaBytes.write('WAVE', 8)
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  )
  const manifests = [
    { id: crypto.randomUUID(), name: '录音.wav', mime: 'audio/wav', size: mediaBytes.length },
    { id: crypto.randomUUID(), name: '照片.png', mime: 'image/png', size: imageBytes.length }
  ]
  const before = (
    await postSync(token, { protocol: 2, changes: [] })
  ).body.documents.find((d) => d.id === syncNote.id)
  const digest = (v) => createHash('sha256').update(v).digest('hex')
  const canonical = (v) =>
    Array.isArray(v)
      ? '[' + v.map(canonical).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v)
  const withMedia = structuredClone(before)
  withMedia.value.attachments = manifests
  assert.equal(
    (
      await postSync(token, {
        protocol: 2,
        changes: [{ document: withMedia, base: digest(canonical(before)) }]
      })
    ).code,
    200
  )
  assert.equal(
    (
      await postSync(token, {
        operation: 'asset-read',
        id: crypto.randomUUID(),
        offset: 0
      })
    ).code,
    400
  )
  for (const [i, bytes] of [mediaBytes, imageBytes].entries()) {
    const id = manifests[i].id,
      sha256 = digest(bytes)
    assert.equal(
      (await postSync(token, { operation: 'asset-probe', id })).body.exists,
      false
    )
    if (i === 1) {
      assert.equal(
        (
          await postSync(token, {
            operation: 'asset-write',
            id,
            offset: 0,
            total: bytes.length,
            sha256: '0'.repeat(64),
            data: bytes.toString('base64')
          })
        ).code,
        400
      )
      assert.equal(
        (await postSync(token, { operation: 'asset-probe', id })).body.exists,
        false
      )
    }
    for (let offset = 0; offset < bytes.length; offset += 393216) {
      const part = await postSync(token, {
        operation: 'asset-write',
        id,
        offset,
        total: bytes.length,
        sha256,
        data: bytes.subarray(offset, offset + 393216).toString('base64')
      })
      assert.equal(part.code, 200)
    }
    assert.equal(
      (await postSync(token, { operation: 'asset-probe', id })).body.sha256,
      sha256
    )
    const loaded = await api(`return Array.from((await window.api.journal.media('${id}')).bytes)`)
    assert.equal(digest(Buffer.from(loaded)), sha256)
    let chunks = []
    for (let offset = 0; offset < bytes.length;) {
      const part = await postSync(token, { operation: 'asset-read', id, offset })
      assert.equal(part.code, 200)
      assert.equal(part.body.offset, offset)
      const chunk = Buffer.from(part.body.data, 'base64')
      chunks.push(chunk)
      offset += chunk.length
    }
    assert.equal(digest(Buffer.concat(chunks)), sha256)
  }
  console.log(
    'PASS: actual Electron preload, HTTPS authentication, note metadata, attachment transfer, authorized narration export, checksum rejection and persisted media bytes'
  )
  await api('return await window.api.sync.stop()')
} catch (e) {
  console.error(e)
  console.error(logs.slice(-2500))
  process.exitCode = 1
} finally {
  socket?.close()
  app.kill('SIGTERM')
}
