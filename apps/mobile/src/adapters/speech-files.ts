import { Directory, Filesystem } from '@capacitor/filesystem'
import { assetHash, decodeAsset, encodeAsset } from '@shared/sync/assets'
import { MAX_SPEECH_CHUNK_BYTES, SPEECH_KEY } from '@shared/sync/speech'

function pathFor(key: string) {
  if (!SPEECH_KEY.test(key)) throw Error('无效朗读缓存键')
  return `speech/v1/${key}.audio`
}

export const speechFiles = {
  async read(key: string) {
    const path = pathFor(key)
    try {
      const { data } = await Filesystem.readFile({ directory: Directory.Data, path })
      if (
        typeof data !== 'string' ||
        data.length > Math.ceil((MAX_SPEECH_CHUNK_BYTES + 64) / 3) * 4
      )
        return undefined
      const bytes = decodeAsset(data)
      const digest = new TextDecoder().decode(bytes.subarray(0, 64))
      const audio = bytes.subarray(64)
      if (audio.length && assetHash(audio) === digest) return audio
    } catch {
      // A missing or unreadable file is a cache miss.
    }
    return undefined
  },
  async write(key: string, audio: Uint8Array) {
    const to = pathFor(key)
    const from = `${to}.${crypto.randomUUID()}.tmp`
    const bytes = new Uint8Array(64 + audio.length)
    bytes.set(new TextEncoder().encode(assetHash(audio)))
    bytes.set(audio, 64)
    const directory = Directory.Data
    try {
      await Filesystem.writeFile({
        directory,
        path: from,
        data: encodeAsset(bytes),
        recursive: true
      })
      await Filesystem.rename({ directory, from, to })
    } finally {
      await Filesystem.deleteFile({ directory, path: from }).catch(() => {})
    }
  }
}
