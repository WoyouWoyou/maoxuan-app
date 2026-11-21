import { createServer, type Server } from 'node:https'
import { randomBytes, timingSafeEqual, createHash, X509Certificate } from 'node:crypto'
import { hostname, networkInterfaces } from 'node:os'
import { generate } from 'selfsigned'
import {
  canonical,
  reconcile,
  type SyncDocument,
  type SyncStatus,
  type SyncRequest,
  type SyncPeer
} from '@shared/sync/protocol'
import { mergeMarchState, validateMarchState, type MarchState } from '@shared/sync/march'
import { pairingCode, pairingHash } from '@shared/sync/pairing'
import { advertiseSyncDevice } from './sync-discovery'

const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const secret = () => randomBytes(32).toString('hex')
const hex64 = /^[a-f0-9]{64}$/
const GRANT_MS = 15 * 60 * 1000

export interface SyncRepository {
  speech?: (request: Record<string, unknown>) => Promise<unknown>
  asset?: (request: any) => unknown
  read(): SyncDocument[]
  apply(d: SyncDocument[]): void
  readMarch(): MarchState
  writeMarch(state: MarchState): void
  transaction<T>(work: () => T): T
}

export function createLanSync(
  repo: SyncRepository,
  testHost?: string,
  identity?: () => Promise<{ cert: string; private: string }>,
  onChanged?: () => void,
  confirmPairing?: (code: string, remote: string, signal: AbortSignal) => Promise<boolean>
) {
  let server: Server | undefined
  let stopDiscovery: (() => void) | undefined
  let stopPairing: AbortController | undefined
  let status: SyncStatus = { running: false }
  let starting = false
  return {
    status: () => structuredClone(status),
    async start(): Promise<SyncStatus> {
      if (server) return structuredClone(status)
      if (starting) throw Error('同步服务正在启动')
      starting = true
      const lifetime = new AbortController()
      stopPairing = lifetime
      try {
        const ip =
          testHost ??
          Object.values(networkInterfaces())
            .flat()
            .find(
              (n) =>
                n?.family === 'IPv4' &&
                !n.internal &&
                /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)
            )?.address
        if (!ip) throw Error('没有可用的局域网 IPv4 地址，请先连接路由器')
        const pem = identity
          ? await identity()
          : await generate([{ name: 'commonName', value: 'Maoxuan local sync' }], {
              keySize: 2048,
              algorithm: 'sha256'
            })
        if (lifetime.signal.aborted) return structuredClone(status)
        const fingerprint = createHash('sha256')
          .update(new X509Certificate(pem.cert).raw)
          .digest('hex')
        const sessionId = randomBytes(16).toString('hex')
        const challenges = new Map<string, { commitment: string; nonce: string; expires: number }>()
        const grants = new Map<string, { token: string; expires: number }>()
        let pairing = false
        let nextPromptAt = 0
        const next = createServer(
          { key: pem.private, cert: pem.cert, minVersion: 'TLSv1.2' },
          (req, res) => {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            // Android uses an isolated pinned TLS connection for each request.
            // Idle sockets would otherwise occupy the server's connection limit.
            res.setHeader('Connection', 'close')
            const reject = () => res.writeHead(403).end('{"error":"连接未授权或已撤销"}')
            if (req.method !== 'POST' || req.url !== '/sync') {
              reject()
              req.resume()
              return
            }
            const remote = req.socket.remoteAddress ?? ''
            const grant = grants.get(remote)
            const supplied = Buffer.from(String(req.headers.authorization ?? ''))
            const expected = Buffer.from(`Bearer ${grant?.token ?? ''}`)
            const authorized =
              !!grant &&
              grant.expires > Date.now() &&
              supplied.length === expected.length &&
              timingSafeEqual(supplied, expected)
            if (supplied.length && !authorized) {
              reject()
              req.resume()
              return
            }
            let size = 0
            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => {
              size += chunk.length
              if (size > (authorized ? 20e6 : 2048)) {
                res.writeHead(413).end('{"error":"同步请求过大"}')
                req.destroy()
              } else chunks.push(chunk)
            })
            req.on('end', async () => {
              if (res.writableEnded || lifetime.signal.aborted) return
              try {
                const input = JSON.parse(Buffer.concat(chunks).toString())
                if (!authorized) {
                  if (!confirmPairing || input?.sessionId !== sessionId) {
                    reject()
                    return
                  }
                  if (
                    input.operation === 'pair-start' &&
                    typeof input.commitment === 'string' &&
                    hex64.test(input.commitment)
                  ) {
                    const now = Date.now()
                    for (const [address, challenge] of challenges)
                      if (challenge.expires <= now) challenges.delete(address)
                    if (
                      pairing ||
                      now < nextPromptAt ||
                      challenges.has(remote) ||
                      challenges.size >= 32
                    )
                      throw Error('电脑正在处理配对，请稍后再试')
                    const nonce = secret()
                    challenges.set(remote, {
                      commitment: input.commitment,
                      nonce,
                      expires: now + 10000
                    })
                    res.end(JSON.stringify({ nonce }))
                    return
                  }
                  const challenge = challenges.get(remote)
                  if (
                    input.operation !== 'pair-confirm' ||
                    !challenge ||
                    challenge.expires <= Date.now() ||
                    typeof input.nonce !== 'string' ||
                    !hex64.test(input.nonce) ||
                    pairingHash(input.nonce) !== challenge.commitment
                  ) {
                    reject()
                    return
                  }
                  challenges.delete(remote)
                  if (pairing || Date.now() < nextPromptAt)
                    throw Error('电脑正在处理配对，请稍后再试')
                  pairing = true
                  nextPromptAt = Date.now() + 3000
                  const connection = new AbortController()
                  res.once('close', () => connection.abort())
                  const signal = AbortSignal.any([
                    lifetime.signal,
                    connection.signal,
                    AbortSignal.timeout(55000)
                  ])
                  try {
                    const approved = await confirmPairing(
                      pairingCode(fingerprint, input.nonce, challenge.nonce),
                      remote,
                      signal
                    )
                    if (!approved || signal.aborted) {
                      if (!res.destroyed) reject()
                      return
                    }
                    const token = secret()
                    for (const [address, existing] of grants)
                      if (existing.expires <= Date.now()) grants.delete(address)
                    grants.set(remote, { token, expires: Date.now() + GRANT_MS })
                    res.end(JSON.stringify({ token }))
                  } finally {
                    pairing = false
                  }
                  return
                }
                grant.expires = Date.now() + GRANT_MS
                if (input?.operation === 'speech-list' || input?.operation === 'speech-read') {
                  if (!repo.speech) throw Error('请更新电脑应用后再下载朗读音频')
                  res.end(JSON.stringify(await repo.speech(input)))
                  return
                }
                const request = input as SyncRequest
                if (request?.operation && request.operation !== 'sync-snapshot') {
                  if (!repo.asset) throw Error('附件同步尚未启用')
                  const result = repo.asset(request) as { complete?: boolean }
                  res.end(JSON.stringify(result))
                  if (result.complete) onChanged?.()
                  return
                }
                const output = repo.transaction(() => {
                  const reply = reconcile(repo.read(), request, hash)
                  if (request.march !== undefined) {
                    validateMarchState(request.march)
                    repo.writeMarch(mergeMarchState(repo.readMarch(), request.march))
                  }
                  repo.apply(reply.documents)
                  reply.documents = repo.read()
                  if (reply.documents.length > 10000) throw Error('同步记录超过 10000 项')
                  if (request.march !== undefined) {
                    reply.march = repo.readMarch()
                    validateMarchState(reply.march)
                  }
                  const json = JSON.stringify(reply)
                  if (Buffer.byteLength(json) > 20e6)
                    throw Error('同步文本超过20MB，请减少数据后重试')
                  return json
                })
                res.end(output)
                onChanged?.()
              } catch (e) {
                if (res.destroyed || res.writableEnded) return
                res
                  .writeHead(400)
                  .end(JSON.stringify({ error: e instanceof Error ? e.message : '同步失败' }))
              }
            })
          }
        )
        next.requestTimeout = 30000
        next.headersTimeout = 10000
        next.maxConnections = 8
        await new Promise<void>((ok, no) => {
          next.once('error', no)
          next.listen(0, ip, () => {
            next.removeListener('error', no)
            ok()
          })
        })
        if (lifetime.signal.aborted) {
          await new Promise<void>((ok) => next.close(() => ok()))
          return structuredClone(status)
        }
        next.on('error', (e) => {
          if (server === next) status = { ...status, error: e.message }
        })
        server = next
        const port = (next.address() as { port: number }).port
        const device: SyncPeer = {
          id: sessionId,
          name: hostname().slice(0, 100),
          url: `https://${ip}:${port}/sync`,
          fingerprint
        }
        status = { running: true, device }
        try {
          const close = await advertiseSyncDevice(device, (message) => {
            if (server === next) status = { ...status, discoveryError: message }
          })
          if (server === next) stopDiscovery = close
          else close()
        } catch {
          // The HTTPS service remains independently reachable for diagnostics.
        }
        return structuredClone(status)
      } finally {
        if (!server && stopPairing === lifetime) stopPairing = undefined
        starting = false
      }
    },
    async stop() {
      const old = server
      server = undefined
      status = { running: false }
      stopPairing?.abort()
      stopPairing = undefined
      stopDiscovery?.()
      stopDiscovery = undefined
      if (old) {
        old.closeAllConnections()
        await new Promise<void>((ok) => old.close(() => ok()))
      }
      return structuredClone(status)
    }
  }
}
