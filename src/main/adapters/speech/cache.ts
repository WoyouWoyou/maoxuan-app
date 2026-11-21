import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpeechRequest } from '@shared/contracts/reader'
import { SPEECH_KEY, speechCacheKey } from '@shared/sync/speech'
export { speechCacheKey } from '@shared/sync/speech'

const MAGIC = Buffer.from('MAOXUAN-SPEECH-1\n')
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest()
export interface SpeechCache {
  read(key: string): Promise<Uint8Array | undefined>
  get(request: SpeechRequest, signal: AbortSignal): Promise<Uint8Array>
}
export function createSpeechCache(
  directory: string,
  synthesize: (request: SpeechRequest, signal: AbortSignal) => Promise<Uint8Array>,
  options: { bundledDirectory?: string } = {}
): SpeechCache {
  type Job = { controller: AbortController; consumers: Set<object>; result: Promise<Uint8Array> }
  const jobs = new Map<string, Job>()
  async function read(file: string): Promise<Uint8Array | undefined> {
    try {
      const data = await readFile(file)
      const audio = data.subarray(MAGIC.length + 32)
      if (
        data.subarray(0, MAGIC.length).equals(MAGIC) &&
        audio.length > 0 &&
        data.subarray(MAGIC.length, MAGIC.length + 32).equals(hash(audio))
      )
        return new Uint8Array(audio)
      // An interrupted/corrupt cache entry is treated as a miss and atomically replaced.
      return undefined
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new Error('无法读取本地语音缓存，请检查应用数据目录权限', { cause: error })
    }
  }
  async function generate(file: string, request: SpeechRequest, signal: AbortSignal) {
    const audio = await synthesize(request, signal)
    signal.throwIfAborted()
    if (!audio.length) throw new Error('语音服务未返回音频')
    await mkdir(directory, { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, Buffer.concat([MAGIC, hash(audio), audio]))
      signal.throwIfAborted()
      await rename(temporary, file)
    } finally {
      await unlink(temporary).catch(() => {})
    }
    return audio
  }
  async function readCached(key: string) {
    if (!SPEECH_KEY.test(key)) throw Error('无效朗读缓存键')
    const filename = `${key}.audio`
    // Installation resources are immutable; use them directly without copying to userData.
    return (
      (options.bundledDirectory && (await read(path.join(options.bundledDirectory, filename)))) ||
      read(path.join(directory, filename))
    )
  }
  return {
    read: readCached,
    async get(request, signal) {
      signal.throwIfAborted()
      const key = speechCacheKey(request)
      const file = path.join(directory, `${key}.audio`)
      const cached = await readCached(key)
      signal.throwIfAborted()
      if (cached) return cached
      let job = jobs.get(key)
      if (!job || job.controller.signal.aborted) {
        const controller = new AbortController()
        job = {
          controller,
          consumers: new Set(),
          result: generate(file, request, controller.signal)
        }
        jobs.set(key, job)
        const owned = job
        void job.result
          .finally(() => {
            if (jobs.get(key) === owned) jobs.delete(key)
          })
          .catch(() => {})
      }
      const shared = job
      const consumer = {}
      shared.consumers.add(consumer)
      return new Promise<Uint8Array>((resolve, reject) => {
        const release = () => {
          signal.removeEventListener('abort', abort)
          shared.consumers.delete(consumer)
          if (!shared.consumers.size) shared.controller.abort()
        }
        const abort = () => {
          release()
          reject(signal.reason ?? new Error('朗读已取消'))
        }
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) {
          abort()
          return
        }
        shared.result.then(
          (audio) => {
            release()
            resolve(audio)
          },
          (error) => {
            release()
            reject(error)
          }
        )
      })
    }
  }
}
