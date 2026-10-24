import { app } from 'electron'
import path from 'node:path'
import { createSpeechCache, type SpeechCache } from '../speech/cache'
import { ipcMain } from 'electron'
import { validateIpcArguments } from '@shared/contracts/ipc'
import type { SpeechRequest } from '@shared/contracts/reader'
import { getReaderPreferences } from '../../modules/settings/public'
import { synthesizeEdge } from '../speech/edge'

export function registerSpeechHandlers(cache?: SpeechCache) {
  const audioCache =
    cache ??
    createSpeechCache(path.join(app.getPath('userData'), 'speech-cache', 'v1'), synthesizeEdge, {
      bundledDirectory: app.isPackaged
        ? path.join(process.resourcesPath, 'core-audio', 'v1')
        : path.join(app.getAppPath(), 'resources', 'core-audio', 'v1')
    })
  const active = new Map<
    number,
    Map<string, { controller: AbortController; background: boolean }>
  >()
  const watched = new Set<number>()
  async function handle(event: Electron.IpcMainInvokeEvent, input: unknown, background: boolean) {
    validateIpcArguments(background ? 'speech:prefetch' : 'speech:synthesize', [input])
    if (!getReaderPreferences().enabled) throw new Error('请先启用朗读')
    const request = input as SpeechRequest
    const owner = event.sender.id
    let requests = active.get(owner)
    if (!requests) {
      requests = new Map()
      active.set(owner, requests)
    }
    // Foreground navigation supersedes foreground audio, never its shared background job.
    for (const [id, previous] of requests) {
      if (id === request.id || (!background && !previous.background)) {
        previous.controller.abort()
        requests.delete(id)
      }
    }
    if (background && [...requests.values()].filter((r) => r.background).length >= 2)
      throw new Error('后台预生成任务过多')
    const controller = new AbortController()
    requests.set(request.id, { controller, background })
    if (!watched.has(owner)) {
      watched.add(owner)
      event.sender.once('destroyed', () => {
        active.get(owner)?.forEach((r) => r.controller.abort())
        active.delete(owner)
        watched.delete(owner)
      })
    }
    try {
      const audio = await audioCache.get(request, controller.signal)
      controller.signal.throwIfAborted()
      return background ? undefined : audio
    } catch (error) {
      if (controller.signal.aborted) throw new Error('朗读已取消')
      throw new Error(
        `语音加载失败，请检查网络及本地缓存后重试，或切换系统语音。${error instanceof Error ? error.message : ''}`
      )
    } finally {
      if (requests.get(request.id)?.controller === controller) requests.delete(request.id)
    }
  }
  ipcMain.handle('speech:synthesize', (event, input: unknown) => handle(event, input, false))
  ipcMain.handle('speech:prefetch', (event, input: unknown) => handle(event, input, true))
  ipcMain.handle('speech:cancel', (event, id: unknown) => {
    validateIpcArguments('speech:cancel', [id])
    const requests = active.get(event.sender.id)
    const request = requests?.get(id as string)
    if (request) {
      request.controller.abort()
      requests?.delete(id as string)
    }
  })
}
