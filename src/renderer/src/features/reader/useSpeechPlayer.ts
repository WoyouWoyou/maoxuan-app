import { prefetchSpeech } from './prefetch'
import { useEffect, useRef, useState } from 'react'
import type { ReaderPreferences } from '@shared/contracts/reader'
import { speechChunks } from '@shared/contracts/reader'

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'done'
// One playback owner across all readers, including source drawers.
let stopOwner: { id: object; stop(): void } | undefined
export function useSpeechPlayer(
  articleId: string,
  paragraphs: string[],
  preferences: ReaderPreferences
) {
  const [state, setState] = useState({ status: 'idle' as PlaybackStatus, index: -1, error: '' })
  const owner = useRef({})
  const prefetch = useRef<ReturnType<typeof prefetchSpeech> | undefined>(undefined)
  const [cacheProgress, setCacheProgress] = useState({ ready: 0, total: 0, failed: 0 })
  const settle = useRef<(() => void) | undefined>(undefined)
  const speakingSystem = useRef(false)
  const run = useRef(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const url = useRef('')
  const requestId = useRef('')
  const paused = useRef(false)
  const lastSingle = useRef(false)
  const current = useRef(preferences)
  current.current = preferences
  function cleanAudio() {
    if (audio.current) {
      audio.current.onended = null
      audio.current.onerror = null
      audio.current.pause()
      audio.current.removeAttribute('src')
      audio.current.load()
      audio.current = null
    }
    if (url.current) {
      URL.revokeObjectURL(url.current)
      url.current = ''
    }
    if (requestId.current) {
      void window.api.speech.cancel(requestId.current).catch(() => {})
      requestId.current = ''
    }
    if (speakingSystem.current) {
      window.speechSynthesis?.cancel()
      speakingSystem.current = false
    }
    settle.current?.()
    settle.current = undefined
  }
  function stop() {
    run.current++
    paused.current = false
    prefetch.current?.stop()
    prefetch.current = undefined
    setCacheProgress({ ready: 0, total: 0, failed: 0 })
    cleanAudio()
    setState({ status: 'idle', index: -1, error: '' })
    if (stopOwner?.id === owner.current) stopOwner = undefined
  }
  async function start(index = 0, single = false) {
    stopOwner?.stop()
    stop()
    stopOwner = { id: owner.current, stop }
    const token = run.current
    const config = { ...current.current }
    lastSingle.current = single
    if (!config.enabled || !paragraphs[index]) return
    const work = paragraphs
      .slice(index, single ? index + 1 : undefined)
      .flatMap((text, offset) =>
        speechChunks(text).map((text) => ({ text, index: index + offset }))
      )
    const ready = new Set<number>()
    let currentChunk = 0
    const markReady = (index: number) => {
      if (token !== run.current) return
      ready.add(index)
      setCacheProgress((p) => ({ ...p, ready: ready.size }))
    }
    if (config.provider === 'edge') setCacheProgress({ ready: 0, total: work.length, failed: 0 })
    try {
      for (const [position, chunk] of work.entries()) {
        currentChunk = position
        if (token !== run.current) return
        setState({ status: paused.current ? 'paused' : 'loading', index: chunk.index, error: '' })
        if (config.provider === 'edge') {
          const id = crypto.randomUUID()
          requestId.current = id
          const bytes = await window.api.speech.synthesize({
            id,
            text: chunk.text,
            voice: config.voice
          })
          if (token !== run.current) return
          requestId.current = ''
          markReady(position)
          // Only start the background lane after the first playable audio is available.
          if (!prefetch.current && work.length > 1) {
            prefetch.current = prefetchSpeech(
              work.map((chunk) => chunk.text),
              config.voice,
              window.api.speech,
              {
                skip: (index) => index <= currentChunk || ready.has(index),
                ready: markReady,
                failed: () => {
                  if (token === run.current)
                    setCacheProgress((p) => ({ ...p, failed: p.failed + 1 }))
                }
              }
            )
          }
          url.current = URL.createObjectURL(
            new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' })
          )
          const media = new Audio(url.current)
          audio.current = media
          media.playbackRate = current.current.rate
          await new Promise<void>((resolve, reject) => {
            settle.current = resolve
            media.onended = () => {
              cleanAudio()
              resolve()
            }
            media.onerror = () => reject(new Error('音频播放失败，请重试'))
            if (!paused.current) {
              void media
                .play()
                .then(() => {
                  if (token === run.current) {
                    if (paused.current) media.pause()
                    setState((s) => ({ ...s, status: paused.current ? 'paused' : 'playing' }))
                  }
                })
                .catch(reject)
            }
          })
        } else {
          const synth = window.speechSynthesis
          const voices = synth?.getVoices().filter((v) => /^zh/i.test(v.lang)) ?? []
          if (!voices.length) throw new Error('当前系统没有可用的中文语音，请选择 Edge 在线语音')
          await new Promise<void>((resolve, reject) => {
            settle.current = resolve
            speakingSystem.current = true
            const utterance = new SpeechSynthesisUtterance(chunk.text)
            utterance.lang = 'zh-CN'
            utterance.voice = voices[0]
            utterance.rate = current.current.rate
            utterance.onend = () => resolve()
            utterance.onerror = (e) => reject(new Error(`系统朗读失败：${e.error}`))
            utterance.onstart = () => {
              if (token === run.current) {
                if (paused.current) synth.pause()
                setState((s) => ({ ...s, status: paused.current ? 'paused' : 'playing' }))
              }
            }
            synth.speak(utterance)
          })
        }
      }
      if (token === run.current) {
        prefetch.current?.stop()
        prefetch.current = undefined
        speakingSystem.current = false
        settle.current = undefined
        setState({ status: 'done', index: -1, error: '' })
        stopOwner = undefined
      }
    } catch (error) {
      if (token !== run.current) return
      prefetch.current?.stop()
      prefetch.current = undefined
      cleanAudio()
      setState((s) => ({
        ...s,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }))
    }
  }
  function togglePause() {
    if (state.status === 'error' || state.status === 'done' || state.status === 'idle') return
    paused.current = !paused.current
    if (current.current.provider === 'system') {
      if (paused.current) window.speechSynthesis.pause()
      else window.speechSynthesis.resume()
    } else if (paused.current) audio.current?.pause()
    else if (audio.current)
      void audio.current.play().catch((error) => {
        setState((s) => ({ ...s, status: 'error', error: String(error) }))
      })
    setState((s) => ({
      ...s,
      status: paused.current
        ? 'paused'
        : audio.current || current.current.provider === 'system'
          ? 'playing'
          : 'loading'
    }))
  }
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = preferences.rate
  }, [preferences.rate])
  useEffect(() => {
    stop()
    return stop
  }, [articleId, paragraphs, preferences.enabled, preferences.provider, preferences.voice])
  return {
    ...state,
    cacheProgress,
    start,
    stop,
    togglePause,
    retry: () => start(Math.max(0, state.index), lastSingle.current)
  }
}
