import { useEffect, useRef, useState } from 'react'
import { activeStorySection } from './story-timeline'
import { storyAudioTiming } from './story-audio-timing'

export function useStoryNarration(id: string) {
  const audio = useRef<HTMLAudioElement>(null)
  const alive = useRef(true)
  const pendingSeek = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(storyAudioTiming[id].duration)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(0.8)
  const [error, setError] = useState('')
  useEffect(() => {
    alive.current = true
    const element = audio.current
    return () => {
      alive.current = false
      element?.pause()
    }
  }, [])
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate
  }, [rate])
  useEffect(() => {
    if (audio.current) audio.current.volume = volume
  }, [volume])
  const start = () => {
    const element = audio.current
    if (!element) return
    setError('')
    setLoading(true)
    void element.play().catch(() => {
      if (!alive.current) return
      setLoading(false)
      setPlaying(false)
      setError('解说暂时无法播放，请点击重试。')
    })
  }
  const toggle = () => {
    if (audio.current && !audio.current.paused) audio.current.pause()
    else start()
  }
  const seek = (seconds: number) => {
    const value = Math.max(0, Math.min(duration, seconds))
    if (!audio.current) return
    if (audio.current.readyState === 0) pendingSeek.current = value
    else audio.current.currentTime = value
    setPosition(value)
  }
  const playSection = (index: number) => {
    seek(storyAudioTiming[id].starts[index])
    start()
  }
  const events = {
    onLoadedMetadata: () => {
      const element = audio.current
      if (!element) return
      if (Number.isFinite(element.duration)) setDuration(element.duration)
      element.playbackRate = rate
      element.volume = volume
      if (pendingSeek.current !== null) {
        element.currentTime = pendingSeek.current
        pendingSeek.current = null
      }
    },
    onPlaying: () => {
      setPlaying(true)
      setLoading(false)
      setError('')
    },
    onPlay: () => setPlaying(true),
    onWaiting: () => {
      if (!audio.current?.paused) setLoading(true)
    },
    onPause: () => {
      setPlaying(false)
      setLoading(false)
    },
    onEnded: () => {
      setPlaying(false)
      setLoading(false)
      setPosition(duration)
    },
    onTimeUpdate: () => setPosition(audio.current?.currentTime ?? 0),
    onError: () => {
      setPlaying(false)
      setLoading(false)
      setError('内置解说未能载入，请重新打开这一站。')
    }
  }
  return {
    audio,
    playing,
    loading,
    position,
    duration,
    rate,
    volume,
    error,
    setRate,
    setVolume,
    toggle,
    seek,
    playSection,
    activeSection: activeStorySection(storyAudioTiming[id].starts, position),
    events
  }
}
