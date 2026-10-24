import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createSpeechCache, speechCacheKey } from '../src/main/adapters/speech/cache'
import type { SpeechRequest } from '../src/shared/contracts/reader'

const directories: string[] = []
async function directory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'maoxuan-speech-cache-'))
  directories.push(dir)
  return dir
}
const request = (
  id = 'test',
  voice = 'zh-CN-XiaoxiaoNeural',
  text = '缓存同一段正文。'
): SpeechRequest => ({ id, text, voice })
const signal = () => new AbortController().signal
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('persistent speech cache', () => {
  it('reuses audio after restart without the network and keys by voice/text rather than request ID', async () => {
    const dir = await directory()
    const synthesize = vi.fn(async () => new Uint8Array([1, 2, 3, 4]))
    const first = createSpeechCache(dir, synthesize)
    expect(await first.get(request(), signal())).toEqual(new Uint8Array([1, 2, 3, 4]))
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    const restarted = createSpeechCache(dir, offline)
    expect(await restarted.get(request('new-id'), signal())).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(offline).not.toHaveBeenCalled()
    await first.get(request('new-voice', 'zh-CN-YunxiNeural'), signal())
    await first.get(request('new-text', undefined, '另一段正文'), signal())
    expect(synthesize).toHaveBeenCalledTimes(3)
    expect((await readdir(dir)).every((name) => /^[a-f0-9]{64}\.audio$/.test(name))).toBe(true)
    expect(speechCacheKey(request())).toBe(speechCacheKey(request('different-id')))
  })
  it('plays bundled audio offline without creating or populating the user cache', async () => {
    const bundled = await directory(),
      userDirectory = path.join(await directory(), 'not-created')
    const source = createSpeechCache(bundled, async () => new Uint8Array([4, 5, 6]))
    await source.get(request(), signal())
    const network = vi.fn(async () => {
      throw new Error('offline')
    })
    const installed = createSpeechCache(userDirectory, network, { bundledDirectory: bundled })
    expect(await installed.get(request('installed'), signal())).toEqual(new Uint8Array([4, 5, 6]))
    expect(network).not.toHaveBeenCalled()
    await expect(readdir(userDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('uses user cache for a different voice and falls back when a bundled entry is corrupt', async () => {
    const bundled = await directory(),
      user = await directory()
    const network = vi.fn(async () => new Uint8Array([7, 8, 9]))
    const installed = createSpeechCache(user, network, { bundledDirectory: bundled })
    await writeFile(path.join(bundled, `${speechCacheKey(request())}.audio`), 'broken')
    expect(await installed.get(request(), signal())).toEqual(new Uint8Array([7, 8, 9]))
    await installed.get(request('other', 'zh-CN-YunxiNeural'), signal())
    expect(network).toHaveBeenCalledTimes(2)
    expect(await readdir(user)).toHaveLength(2)
  })
  it('coalesces background/foreground requests; cancelling one subscriber does not cancel the other', async () => {
    const dir = await directory()
    let resolve!: (audio: Uint8Array) => void
    let generatedSignal!: AbortSignal
    const synthesize = vi.fn((_request, input) => {
      generatedSignal = input
      return new Promise<Uint8Array>((r) => {
        resolve = r
      })
    })
    const cache = createSpeechCache(dir, synthesize)
    const background = new AbortController()
    const foreground = new AbortController()
    const first = cache.get(request('prefetch'), background.signal)
    const firstCanceled = expect(first).rejects.toThrow('cancel background')
    const second = cache.get(request('playback'), foreground.signal)
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1))
    await tick()
    background.abort(new Error('cancel background'))
    await firstCanceled
    expect(generatedSignal.aborted).toBe(false)
    resolve(new Uint8Array([5, 6, 7]))
    expect(await second).toEqual(new Uint8Array([5, 6, 7]))
    expect(synthesize).toHaveBeenCalledTimes(1)
  })
  it('does not persist aborted or failed synthesis and retries on the next request', async () => {
    const dir = await directory()
    let resolve!: (audio: Uint8Array) => void
    const synthesize = vi.fn(
      () =>
        new Promise<Uint8Array>((r) => {
          resolve = r
        })
    )
    const cache = createSpeechCache(dir, synthesize)
    const controller = new AbortController()
    const pending = cache.get(request(), controller.signal)
    const canceled = expect(pending).rejects.toThrow('stop')
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledOnce())
    controller.abort(new Error('stop'))
    await canceled
    resolve(new Uint8Array([1]))
    await tick()
    expect(await readdir(dir)).toEqual([])
    synthesize.mockRejectedValueOnce(new Error('network down'))
    await expect(cache.get(request(), signal())).rejects.toThrow('network down')
    expect(await readdir(dir)).toEqual([])
    synthesize.mockResolvedValueOnce(new Uint8Array([9]))
    expect(await cache.get(request(), signal())).toEqual(new Uint8Array([9]))
  })
  it('regenerates a corrupt entry rather than playing invalid cached audio', async () => {
    const dir = await directory()
    const synthesize = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const cache = createSpeechCache(dir, synthesize)
    await cache.get(request(), signal())
    await writeFile(path.join(dir, `${speechCacheKey(request())}.audio`), 'truncated')
    await cache.get(request(), signal())
    expect(synthesize).toHaveBeenCalledTimes(2)
    expect((await readdir(dir)).filter((file) => file.endsWith('.tmp'))).toEqual([])
  })
})
