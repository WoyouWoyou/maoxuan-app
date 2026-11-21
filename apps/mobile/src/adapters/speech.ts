import { Capacitor, registerPlugin } from '@capacitor/core'
import type { MaoxuanApi } from '@shared/api'
import { speechCacheKey } from '@shared/sync/speech'

const native = registerPlugin<{
  synthesize(input: { id: string; text: string }): Promise<{ uri: string }>
  cancel(input: { id: string }): Promise<void>
}>('SystemSpeech')

export function createMobileSpeech(): MaoxuanApi['speech'] {
  const android = Capacitor.getPlatform() === 'android'
  const unsupported = async () => {
    throw Error('手机使用已下载音频或系统语音')
  }
  return {
    synthesize: unsupported,
    prefetch: unsupported,
    async cancel(id) {
      if (android) await native.cancel({ id })
    },
    async localAudio(request) {
      if (!Capacitor.isNativePlatform()) return undefined
      const { speechFiles } = await import('./speech-files')
      return speechFiles.read(speechCacheKey(request))
    },
    systemAudio: android
      ? async ({ id, text }) =>
          Capacitor.convertFileSrc((await native.synthesize({ id, text })).uri)
      : undefined,
    requestDownload: android
      ? (request) =>
          window.dispatchEvent(new CustomEvent('speech-download-request', { detail: request }))
      : undefined
  }
}
