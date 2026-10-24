import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { ProxyAgent, Socks5ProxyAgent, setGlobalDispatcher } from 'undici'
import { loadSpeechTools, coreAudioPlan } from './core-audio-plan.mjs'

const tools = await loadSpeechTools()
const directory = path.resolve('resources/core-audio/v1')
const progressFile = path.resolve('.codegen/core-audio-progress.json')
const checkOnly = process.argv.includes('--check')
const workers = Number(process.argv.find((arg) => arg.startsWith('--workers='))?.split('=')[1] ?? 3)
if (!Number.isInteger(workers) || workers < 1 || workers > 4)
  throw new Error('workers must be between 1 and 4')
const proxyUrl = process.env.SPEECH_PROXY_URL
if (proxyUrl)
  setGlobalDispatcher(
    proxyUrl.startsWith('socks') ? new Socks5ProxyAgent(proxyUrl) : new ProxyAgent(proxyUrl)
  )
const plan = await coreAudioPlan(tools)
await fs.mkdir(directory, { recursive: true })
await fs.mkdir(path.dirname(progressFile), { recursive: true })
const unique = new Map()
for (const article of plan.articles)
  for (const paragraph of article.paragraphs)
    for (const chunk of paragraph.chunks) {
      if (!unique.has(chunk.key)) unique.set(chunk.key, { ...chunk, title: article.title })
    }
let networkCalls = 0,
  completed = 0,
  cursor = 0
const failures = []
const requests = [...unique.values()]
const cache = tools.createSpeechCache(directory, async (request, signal) => {
  if (checkOnly) throw new Error(`缺少有效的内置音频：${request.id}`)
  networkCalls++
  return tools.synthesizeEdge(request, signal)
})
const metadata = new Map()
let reporting = Promise.resolve()
function report(current) {
  const state = {
    voice: plan.voice,
    completed,
    total: requests.length,
    networkCalls,
    failed: failures.length,
    current,
    updatedAt: new Date().toISOString()
  }
  const json = JSON.stringify(state, null, 2)
  reporting = reporting.then(() => fs.writeFile(progressFile, json))
  if (completed % 10 === 0 || completed === requests.length) console.log(JSON.stringify(state))
}
async function worker() {
  while (cursor < requests.length) {
    const chunk = requests[cursor++]
    let audio
    for (let attempt = 1; attempt <= (checkOnly ? 1 : 5); attempt++) {
      try {
        audio = await cache.get(
          { id: chunk.key, text: chunk.text, voice: plan.voice },
          AbortSignal.timeout(90000)
        )
        break
      } catch (error) {
        if (checkOnly || attempt === 5) {
          failures.push({ key: chunk.key, title: chunk.title, error: error.message })
          break
        }
        console.log(`Retry ${attempt}: ${chunk.title} ${chunk.key.slice(0, 8)}: ${error.message}`)
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 12000)))
      }
    }
    if (audio) {
      if (
        !(audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0) &&
        Buffer.from(audio.subarray(0, 3)).toString() !== 'ID3'
      )
        throw new Error(`返回的不是 MP3：${chunk.key}`)
      metadata.set(chunk.key, {
        bytes: audio.length,
        sha256: createHash('sha256').update(audio).digest('hex')
      })
      completed++
      report(chunk.title)
    }
  }
}
try {
  console.log(
    JSON.stringify({
      voice: plan.voice,
      articles: plan.articles.map((a) => ({
        title: a.title,
        paragraphs: a.paragraphs.length,
        chunks: a.paragraphs.reduce((n, p) => n + p.chunks.length, 0)
      })),
      uniqueChunks: requests.length,
      workers,
      checkOnly
    })
  )
  await Promise.all(Array.from({ length: workers }, worker))
  await reporting
  if (failures.length) {
    await fs.writeFile(
      path.resolve('.codegen/core-audio-failures.json'),
      JSON.stringify(failures, null, 2)
    )
    throw new Error(`${failures.length} 个片段失败，可重新执行命令断点续传`)
  }
  const manifest = {
    ...plan,
    generatedAt: new Date().toISOString(),
    uniqueChunks: requests.length,
    articles: plan.articles.map((a) => ({
      ...a,
      paragraphs: a.paragraphs.map((p) => ({
        ...p,
        chunks: p.chunks.map(({ key }) => ({ key, ...metadata.get(key) }))
      }))
    }))
  }
  // Verify the exact raw audio concatenation for each article by decoding the whole MP3.
  const exports = path.resolve('output/core-five-audio')
  await fs.mkdir(exports, { recursive: true })
  const offline = tools.createSpeechCache(directory, async () => {
    throw new Error('offline validation attempted synthesis')
  })
  for (const article of plan.articles) {
    const full = []
    for (const paragraph of article.paragraphs)
      for (const chunk of paragraph.chunks) {
        full.push(
          await offline.get(
            { id: chunk.key, text: chunk.text, voice: plan.voice },
            new AbortController().signal
          )
        )
      }
    const file = path.join(exports, `${article.title}-晓晓.mp3`)
    await fs.writeFile(file, Buffer.concat(full))
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    })
    if (decoded.status !== 0 || decoded.stderr.trim())
      throw new Error(`MP3 解码校验失败 ${article.title}: ${decoded.stderr || decoded.error}`)
    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', file],
      { encoding: 'utf8' }
    )
    if (probe.status !== 0) throw new Error(`ffprobe failed: ${article.title}`)
    const info = JSON.parse(probe.stdout).format
    const entry = manifest.articles.find((a) => a.id === article.id)
    entry.durationSeconds = Number(info.duration)
    entry.bytes = Number(info.size)
    console.log(JSON.stringify({ verified: article.title, ...info, file }))
  }
  const temporary = path.join(directory, 'manifest.json.tmp')
  await fs.writeFile(temporary, JSON.stringify(manifest, null, 2))
  await fs.rename(temporary, path.join(directory, 'manifest.json'))
  console.log(
    JSON.stringify({
      done: true,
      completed,
      networkCalls,
      manifest: path.join(directory, 'manifest.json'),
      exports
    })
  )
} finally {
  await tools.close()
}
