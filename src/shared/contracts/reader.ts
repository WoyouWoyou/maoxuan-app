import { object, oneOf, bool, text, type Schema } from './validation'

export const EDGE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女声，自然）' },
  { id: 'zh-CN-YunxiNeural', label: '云希（男声，清晰）' },
  { id: 'zh-CN-YunjianNeural', label: '云健（男声，沉稳）' }
] as const
export interface ReaderPreferences {
  layout: 'centered' | 'full'
  enabled: boolean
  provider: 'edge' | 'system'
  voice: string
  rate: number
  follow: boolean
}
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  layout: 'centered',
  enabled: false,
  provider: 'edge',
  voice: EDGE_VOICES[0].id,
  rate: 1,
  follow: true
}
export const readerPreferencesSchema = object({
  layout: oneOf('centered', 'full'),
  enabled: bool,
  provider: oneOf('edge', 'system'),
  voice: oneOf(...EDGE_VOICES.map((v) => v.id)),
  rate: oneOf(0.75, 1, 1.25, 1.5, 2),
  follow: bool
})
export interface SpeechRequest {
  id: string
  text: string
  voice: string
}
const speechText: Schema = (value, path) => {
  text(value, path)
  if (!(value as string).trim() || (value as string).length > 20000)
    throw new Error('朗读文本为空或过长')
}
export const speechRequestSchema = object({
  id: text,
  text: speechText,
  voice: oneOf(...EDGE_VOICES.map((v) => v.id))
})
/** Bound each synthesis request; retain original paragraph identity in the player. */
export function speechChunks(text: string): string[] {
  const clean = text
    .replace(/〔\d+〕/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
  const result: string[] = []
  let chunk = ''
  for (const char of clean) {
    chunk += char
    if ((chunk.length >= 500 && /[。！？；.!?\n]/.test(char)) || chunk.length >= 700) {
      result.push(chunk)
      chunk = ''
    }
  }
  if (chunk) result.push(chunk)
  return result
}
