import { EDGE_VOICES } from '@shared/contracts/reader'
import { assetHash, CHUNK_BYTES, encodeAsset } from '@shared/sync/assets'
import { articleSpeechKeys, MAX_SPEECH_CHUNK_BYTES, type SpeechAsset } from '@shared/sync/speech'
import type { SpeechCache } from '../speech/cache'

export function createSpeechExchange(
  getParagraphs: (articleId: string) => string[] | undefined,
  cache: Pick<SpeechCache, 'read'>
) {
  return async (input: Record<string, unknown>) => {
    const { operation, articleId, voice, key, offset } = input
    if (
      typeof articleId !== 'string' ||
      !articleId ||
      articleId.length > 200 ||
      typeof voice !== 'string' ||
      !EDGE_VOICES.some((option) => option.id === voice)
    )
      throw Error('无效朗读音频请求')
    const paragraphs = getParagraphs(articleId)
    if (!paragraphs) throw Error('电脑找不到对应的内置篇目')
    const keys = articleSpeechKeys(paragraphs, voice)
    const read = async (key: string) => {
      const audio = await cache.read(key)
      if (!audio?.length || audio.length > MAX_SPEECH_CHUNK_BYTES) return undefined
      const asset: SpeechAsset = { key, total: audio.length, sha256: assetHash(audio) }
      return { audio, asset }
    }
    if (operation === 'speech-list') {
      const assets: SpeechAsset[] = []
      for (const key of keys) {
        const file = await read(key)
        if (file) assets.push(file.asset)
      }
      return { assets }
    }
    if (
      operation !== 'speech-read' ||
      typeof key !== 'string' ||
      !keys.includes(key) ||
      typeof offset !== 'number' ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset % CHUNK_BYTES !== 0
    )
      throw Error('无效朗读音频片段')
    const file = await read(key)
    if (!file || offset >= file.asset.total) throw Error('电脑上的音频已变化，请重新下载')
    return {
      ...file.asset,
      offset,
      data: encodeAsset(file.audio.subarray(offset, offset + CHUNK_BYTES))
    }
  }
}
