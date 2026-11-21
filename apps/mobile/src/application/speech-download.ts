import { EDGE_VOICES } from '@shared/contracts/reader'
import { assetHash, CHUNK_BYTES, decodeAsset, MAX_ASSET_BYTES } from '@shared/sync/assets'
import {
  MAX_SPEECH_CHUNK_BYTES,
  SPEECH_KEY,
  type SpeechAsset,
  type SpeechDownload
} from '@shared/sync/speech'

interface SpeechFiles {
  read(key: string): Promise<Uint8Array | undefined>
  write(key: string, bytes: Uint8Array): Promise<void>
}

async function readWithRetry(exchange: (body: object) => Promise<unknown>, body: object) {
  for (const delay of [250, 750]) {
    try {
      return await exchange(body)
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'LAN_INTERRUPTED'
      )
        throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return exchange(body)
}

export async function receiveSpeech(
  request: SpeechDownload,
  exchange: (body: object) => Promise<unknown>,
  files: SpeechFiles,
  progress: (ready: number, available: number) => void
) {
  const { articleId, voice } = request
  if (!EDGE_VOICES.some((option) => option.id === voice)) throw Error('无效朗读音色')
  const expected = new Set(request.keys)
  const reply = (await readWithRetry(exchange, { operation: 'speech-list', articleId, voice })) as {
    assets?: SpeechAsset[]
  }
  const assets = reply?.assets
  if (!Array.isArray(assets) || assets.length > expected.size)
    throw Error('电脑返回的朗读清单无效，或两端正文版本不同')
  let size = 0
  for (const asset of assets) {
    if (
      !asset ||
      !expected.delete(asset.key) ||
      typeof asset.sha256 !== 'string' ||
      !SPEECH_KEY.test(asset.sha256) ||
      !Number.isInteger(asset.total) ||
      asset.total <= 0 ||
      asset.total > MAX_SPEECH_CHUNK_BYTES
    )
      throw Error('电脑返回的朗读清单无效，或两端正文版本不同')
    size += asset.total
  }
  if (size > MAX_ASSET_BYTES) throw Error('本篇朗读音频超过下载大小限制')
  if (!assets.length) throw Error('电脑没有该篇目此音色的朗读音频，请在电脑生成后重试')
  let ready = 0
  progress(ready, assets.length)
  for (const { key, total, sha256 } of assets) {
    const cached = await files.read(key)
    if (!cached || cached.length !== total || assetHash(cached) !== sha256) {
      const audio = new Uint8Array(total)
      for (let offset = 0; offset < total; offset += CHUNK_BYTES) {
        const part = (await readWithRetry(exchange, {
          operation: 'speech-read',
          articleId,
          voice,
          key,
          offset
        })) as (SpeechAsset & { offset: number; data: string }) | null
        const length = Math.min(CHUNK_BYTES, total - offset)
        if (
          !part ||
          part.key !== key ||
          part.offset !== offset ||
          part.total !== total ||
          part.sha256 !== sha256 ||
          typeof part.data !== 'string' ||
          part.data.length !== Math.ceil(length / 3) * 4
        )
          throw Error('朗读音频分块不匹配，请重新下载')
        const chunk = decodeAsset(part.data)
        if (chunk.length !== length) throw Error('朗读音频分块大小不匹配，请重新下载')
        audio.set(chunk, offset)
      }
      if (assetHash(audio) !== sha256) throw Error('朗读音频校验失败，请重新下载')
      await files.write(key, audio)
    }
    progress(++ready, assets.length)
  }
  return { ready, total: request.keys.length }
}
