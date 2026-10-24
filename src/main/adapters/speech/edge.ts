import type { SocketLike } from '@andresaya/edge-tts/dist/core/session'
import { EdgeTTS, Constants } from '@andresaya/edge-tts'
import { WebSocket } from 'undici'
import type { SpeechRequest } from '@shared/contracts/reader'

/** Use the application's dispatcher so HTTP/SOCKS proxy settings apply to speech too. */
class ProxiedEdgeTTS extends EdgeTTS {
  protected openSocket(url: string): SocketLike {
    return new WebSocket(url, {
      headers: { ...Constants.getBaseHeaders(), ...Constants.WSS_HEADERS }
    }) as unknown as SocketLike
  }
  protected async recoverHandshake() {
    return false
  }
}
export async function synthesizeEdge(
  request: SpeechRequest,
  signal: AbortSignal
): Promise<Uint8Array> {
  const tts = new ProxiedEdgeTTS()
  const result = await tts.generate(request.text, request.voice, {
    signal,
    timeout: 20000,
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
  })
  if (!result.audio.length) throw new Error('语音服务未返回音频')
  return new Uint8Array(result.audio)
}
