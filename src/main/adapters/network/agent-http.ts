import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname } from 'node:path'
import { AgentRequestError, type createAgentActions } from '../../modules/agent-access/public'

const HOST = '127.0.0.1'
const PORT = 43179
const MAX_BODY = 32 * 1024

function send(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(JSON.stringify(data))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json')
    throw new AgentRequestError(415, '请使用 application/json')
  const declaredLength = Number(request.headers['content-length'])
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 1)
    throw new AgentRequestError(411, '请提供 Content-Length')
  if (declaredLength > MAX_BODY) throw new AgentRequestError(413, '请求内容过大')
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new AgentRequestError(400, '无效的 JSON')
  }
}

export function createAgentHttp(
  actions: ReturnType<typeof createAgentActions>,
  descriptor: string,
  onChanged: (sessionId: string | null) => void,
  port = PORT
) {
  let token = ''
  let url: string | undefined
  let pending = Promise.resolve<unknown>(undefined)
  const server = createServer(
    { requestTimeout: 5000, headersTimeout: 5000 },
    (request, response) => {
      void handle(request, response).catch((error: unknown) => {
        if (response.destroyed || response.headersSent) return
        if (error instanceof AgentRequestError)
          send(response, error.status, { error: error.message })
        else {
          console.error('Agent 请求失败', error)
          send(response, 500, { error: '任务处理失败，请使用原 requestId 重试' })
        }
      })
    }
  )
  server.setTimeout(5000, (socket) => socket.destroy())

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const authorization = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from('Bearer ' + token)
    if (
      !url ||
      request.headers.host !== url.slice('http://'.length) ||
      request.headers.origin !== undefined ||
      authorization.length !== expected.length ||
      !timingSafeEqual(authorization, expected)
    ) {
      response.setHeader('Connection', 'close')
      throw new AgentRequestError(403, 'Agent 访问未获授权')
    }

    if (request.method === 'GET' && request.url === '/v1/workbenches') {
      send(response, 200, { workbenches: actions.listWorkbenches() })
      return
    }
    if (request.method === 'POST' && request.url === '/v1/actions') {
      const body = await readJson(request)
      if (!url || expected.toString() !== 'Bearer ' + token)
        throw new AgentRequestError(403, 'Agent 访问已关闭')
      const result = actions.schedule(body)
      send(response, result.created ? 201 : 200, result)
      if (result.created) onChanged(result.action.sessionId)
      return
    }
    throw new AgentRequestError(404, '接口不存在')
  }

  const status = () => ({ running: url !== undefined, url })
  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })

  function serialize<T>(job: () => Promise<T>): Promise<T> {
    const result = pending.then(job)
    pending = result.catch(() => undefined)
    return result
  }

  return {
    status,
    start: () =>
      serialize(async () => {
        if (url) return status()
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, HOST, () => {
            server.off('error', reject)
            resolve()
          })
        })
        const nextUrl = `http://${HOST}:${(server.address() as AddressInfo).port}`
        const nextToken = randomBytes(32).toString('hex')
        const temp = descriptor + '.' + randomBytes(8).toString('hex') + '.tmp'
        try {
          mkdirSync(dirname(descriptor), { recursive: true, mode: 0o700 })
          writeFileSync(temp, JSON.stringify({ url: nextUrl, token: nextToken }), {
            mode: 0o600,
            flag: 'wx'
          })
          renameSync(temp, descriptor)
          token = nextToken
          url = nextUrl
          return status()
        } catch (error) {
          await close()
          rmSync(temp, { force: true })
          throw error
        }
      }),
    stop: () =>
      serialize(async () => {
        if (!url) return status()
        url = undefined
        token = ''
        try {
          rmSync(descriptor, { force: true })
        } finally {
          await close()
        }
        return status()
      })
  }
}
