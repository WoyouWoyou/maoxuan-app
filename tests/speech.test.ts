import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  synthesize: vi.fn(),
  enabled: true
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => mocks.handlers.set(channel, fn)
  }
}))
vi.mock('../src/main/adapters/speech/edge', () => ({ synthesizeEdge: mocks.synthesize }))
vi.mock('../src/main/modules/settings/public', () => ({
  getReaderPreferences: () => ({ enabled: mocks.enabled })
}))
import { registerSpeechHandlers } from '../src/main/adapters/electron/speech-handlers'
const request = (id: string) => ({ id, text: '测试正文', voice: 'zh-CN-XiaoxiaoNeural' })
const sender = (id: number) => ({ sender: { id, once: vi.fn() } })
describe('speech IPC ownership and cancellation', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.synthesize.mockReset()
    mocks.enabled = true
    registerSpeechHandlers({ get: mocks.synthesize })
  })
  it('does not transmit text when speech is disabled or parameters are invalid', async () => {
    mocks.enabled = false
    await expect(mocks.handlers.get('speech:synthesize')!(sender(1), request('a'))).rejects.toThrow(
      '请先启用朗读'
    )
    mocks.enabled = true
    await expect(
      mocks.handlers.get('speech:synthesize')!(sender(1), { ...request('a'), voice: 'bad' })
    ).rejects.toThrow()
    expect(mocks.synthesize).not.toHaveBeenCalled()
  })
  it('supersedes only the same window and ignores stale or cross-window cancellation', async () => {
    const jobs: { signal: AbortSignal; resolve(value: Uint8Array): void }[] = []
    mocks.synthesize.mockImplementation(
      (_request, signal) => new Promise((resolve) => jobs.push({ signal, resolve }))
    )
    const first = mocks.handlers.get('speech:synthesize')!(sender(1), request('a'))
    const firstCanceled = expect(first).rejects.toThrow('朗读已取消')
    const other = mocks.handlers.get('speech:synthesize')!(sender(2), request('b'))
    const latest = mocks.handlers.get('speech:synthesize')!(sender(1), request('c'))
    expect(jobs[0].signal.aborted).toBe(true)
    expect(jobs[1].signal.aborted).toBe(false)
    mocks.handlers.get('speech:cancel')!(sender(2), 'c')
    mocks.handlers.get('speech:cancel')!(sender(1), 'a')
    expect(jobs[2].signal.aborted).toBe(false)
    jobs[0].resolve(new Uint8Array([1]))
    await firstCanceled
    mocks.handlers.get('speech:cancel')!(sender(1), 'c')
    expect(jobs[2].signal.aborted).toBe(true)
    jobs[1].resolve(new Uint8Array([2]))
    jobs[2].resolve(new Uint8Array([3]))
    await Promise.all([other, expect(latest).rejects.toThrow('朗读已取消')])
  })
  it('keeps background work alive during foreground playback and returns no audio over prefetch IPC', async () => {
    const jobs: { signal: AbortSignal; resolve(value: Uint8Array): void }[] = []
    mocks.synthesize.mockImplementation(
      (_request, signal) => new Promise((resolve) => jobs.push({ signal, resolve }))
    )
    const background = mocks.handlers.get('speech:prefetch')!(sender(1), request('background'))
    const foreground = mocks.handlers.get('speech:synthesize')!(sender(1), request('foreground'))
    expect(jobs[0].signal.aborted).toBe(false)
    expect(jobs[1].signal.aborted).toBe(false)
    mocks.handlers.get('speech:cancel')!(sender(1), 'foreground')
    expect(jobs[0].signal.aborted).toBe(false)
    expect(jobs[1].signal.aborted).toBe(true)
    const canceled = expect(foreground).rejects.toThrow('朗读已取消')
    jobs[0].resolve(new Uint8Array([1]))
    jobs[1].resolve(new Uint8Array([2]))
    expect(await background).toBeUndefined()
    await canceled
  })
  it('aborts in-flight synthesis when its window is destroyed', async () => {
    const event = sender(1)
    let signal!: AbortSignal
    mocks.synthesize.mockImplementation((_request, input) => {
      signal = input
      return new Promise((_resolve, reject) =>
        input.addEventListener('abort', () => reject(new Error('abort')))
      )
    })
    const pending = mocks.handlers.get('speech:synthesize')!(event, request('a'))
    const assertion = expect(pending).rejects.toThrow('朗读已取消')
    event.sender.once.mock.calls[0][1]()
    await assertion
    expect(signal.aborted).toBe(true)
  })
})
