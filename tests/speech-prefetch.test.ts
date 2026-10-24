import { describe, expect, it, vi } from 'vitest'
import { prefetchSpeech } from '../src/renderer/src/features/reader/prefetch'

describe('sequential speech pre-generation', () => {
  it('skips current audio and pre-generates all following chunks with one worker', async () => {
    let active = 0,
      maximum = 0
    const ready: number[] = []
    const client = {
      prefetch: vi.fn(async () => {
        active++
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active--
      }),
      cancel: vi.fn(async () => {})
    }
    const job = prefetchSpeech(['current', 'next', 'last'], 'voice', client, {
      skip: (i) => i === 0,
      ready: (i) => ready.push(i)
    })
    await job.done
    expect(client.prefetch.mock.calls.map((args) => args[0].text)).toEqual(['next', 'last'])
    expect(ready).toEqual([1, 2])
    expect(maximum).toBe(1)
  })
  it('stops the pending request and never queues later chunks after stop', async () => {
    let resolve!: () => void
    const client = {
      prefetch: vi.fn(
        () =>
          new Promise<void>((r) => {
            resolve = r
          })
      ),
      cancel: vi.fn(async () => {})
    }
    const ready = vi.fn()
    const job = prefetchSpeech(['next', 'last'], 'voice', client, { ready })
    const id = client.prefetch.mock.calls[0][0].id
    job.stop()
    resolve()
    await job.done
    expect(client.cancel).toHaveBeenCalledWith(id)
    expect(client.prefetch).toHaveBeenCalledOnce()
    expect(ready).not.toHaveBeenCalled()
  })
  it('continues after a background failure, leaving foreground playback free to retry', async () => {
    const failed = vi.fn(),
      ready = vi.fn()
    const client = {
      prefetch: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined),
      cancel: vi.fn(async () => {})
    }
    await prefetchSpeech(['next', 'last'], 'voice', client, { failed, ready }).done
    expect(failed).toHaveBeenCalledOnce()
    expect(ready).toHaveBeenCalledWith(1)
  })
})
