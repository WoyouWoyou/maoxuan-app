import { speechChunks, type SpeechRequest } from '../contracts/reader'
import { assetHash } from './assets'

export const MAX_SPEECH_CHUNK_BYTES = 4 * 1024 * 1024
export const SPEECH_KEY = /^[a-f0-9]{64}$/

export interface SpeechDownload {
  articleId: string
  title: string
  voice: string
  keys: string[]
}

export interface SpeechAsset {
  key: string
  total: number
  sha256: string
}

// Keep the desktop's on-disk key stable. Playback speed is applied by the player.
export function speechCacheKey({ text, voice }: Pick<SpeechRequest, 'text' | 'voice'>): string {
  return assetHash(
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        provider: 'edge',
        format: 'audio-24khz-48kbitrate-mono-mp3',
        pitch: 0,
        rate: 0,
        volume: 0,
        voice,
        text
      })
    )
  )
}

export function articleSpeechKeys(paragraphs: string[], voice: string): string[] {
  return [
    ...new Set(
      paragraphs
        .filter((text) => text !== '*')
        .flatMap(speechChunks)
        .map((text) => speechCacheKey({ text, voice }))
    )
  ]
}
