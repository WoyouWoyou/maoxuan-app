import { createServer, type Server } from 'node:https'
import { randomBytes, timingSafeEqual, createHash, X509Certificate } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { generate } from 'selfsigned'
import {
  canonical,
  reconcile,
  type SyncDocument,
  type SyncStatus,
  type SyncRequest
} from '@shared/sync/protocol'
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
export interface SyncRepository {
  read(): SyncDocument[]
  apply(d: SyncDocument[]): void
  transaction<T>(work: () => T): T
}
export function createLanSync(
  repo: SyncRepository,
  testHost?: string,
  identity?: () => Promise<{ cert: string; private: string }>
) {
  let server: Server | undefined
  let status: SyncStatus = { running: false, pairing: [] }
  let starting = false
  return {
    status: () => structuredClone(status),
    async start(): Promise<SyncStatus> {
      if (server) return structuredClone(status)
      if (starting) throw Error('同步服务正在启动')
      starting = true
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
        const fingerprint = createHash('sha256')
          .update(new X509Certificate(pem.cert).raw)
          .digest('hex')
        const token = randomBytes(32).toString('hex')
        const next = createServer(
          { key: pem.private, cert: pem.cert, minVersion: 'TLSv1.2' },
          (req, res) => {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            const supplied = Buffer.from(String(req.headers.authorization ?? ''))
            const expected = Buffer.from(`Bearer ${token}`)
            if (
              req.method !== 'POST' ||
              req.url !== '/sync' ||
              supplied.length !== expected.length ||
              !timingSafeEqual(supplied, expected)
            ) {
              res.writeHead(403).end('{"error":"连接未授权或已撤销"}')
              req.resume()
              return
            }
            let size = 0
            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => {
              size += chunk.length
              if (size > 20e6) {
                res.writeHead(413).end('{"error":"同步数据超过20MB限制"}')
                req.destroy()
              } else chunks.push(chunk)
            })
            req.on('end', () => {
              if (res.writableEnded) return
              try {
                const request = JSON.parse(Buffer.concat(chunks).toString()) as SyncRequest
                const output = repo.transaction(() => {
                  const reply = reconcile(repo.read(), request, hash)
                  repo.apply(reply.documents)
                  reply.documents = repo.read()
                  const json = JSON.stringify(reply)
                  if (Buffer.byteLength(json) > 20e6)
                    throw Error('同步文本超过20MB，请减少数据后重试')
                  return json
                })
                res.end(output)
              } catch (e) {
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
        next.on('error', (e) => {
          status = { ...status, error: e.message }
        })
        server = next
        const port = (next.address() as { port: number }).port
        status = {
          running: true,
          pairing: [
            JSON.stringify({ protocol: 2, url: `https://${ip}:${port}/sync`, fingerprint, token })
          ]
        }
        return structuredClone(status)
      } finally {
        starting = false
      }
    },
    async stop() {
      const old = server
      server = undefined
      status = { running: false, pairing: [] }
      if (old) {
        old.closeAllConnections()
        await new Promise<void>((ok) => old.close(() => ok()))
      }
      return structuredClone(status)
    }
  }
}
