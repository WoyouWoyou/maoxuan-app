import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { marchMusic } from './assets'
const time = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(n % 60)
    .toString()
    .padStart(2, '0')}`
function initialVolume() {
  try {
    const saved = localStorage.getItem('march.music.volume')
    const v = saved === null ? 0.35 : Number(saved)
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.35
  } catch {
    return 0.35
  }
}
export function MusicPlayer({ autoStart = false }: { autoStart?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(initialVolume)
  const [message, setMessage] = useState('')
  const start = () => {
    setMessage('')
    void audio.current?.play().catch(() => setMessage('点击播放，开启这段山河回响。'))
  }
  useEffect(() => {
    if (audio.current) audio.current.volume = volume
    try {
      localStorage.setItem('march.music.volume', String(volume))
    } catch {
      /* preference only */
    }
  }, [volume])
  useEffect(() => {
    const element = audio.current
    if (autoStart) start()
    return () => {
      element?.pause()
    }
  }, [autoStart])
  return (
    <div className="march-player">
      <audio
        ref={audio}
        src={marchMusic}
        loop
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          const n = audio.current?.duration
          if (n && Number.isFinite(n)) setDuration(n)
        }}
        onError={() => {
          setPlaying(false)
          setMessage('配乐载入失败，请重新进入此页面。')
        }}
      />
      <button
        className="march-play"
        aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}
        onClick={() => (playing ? audio.current?.pause() : start())}
      >
        {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
      </button>
      <div className="march-player-track">
        <strong>晴天</strong>
        <span>弦乐盛大版</span>
        <input
          aria-label="音乐播放进度"
          type="range"
          min="0"
          max={duration}
          step=".1"
          value={position}
          disabled={duration === 0}
          onChange={(e) => {
            if (audio.current) audio.current.currentTime = Number(e.target.value)
            setPosition(Number(e.target.value))
          }}
        />
        <small>
          {time(position)} / {time(duration)}
        </small>
        {message && <small role="status">{message}</small>}
      </div>
      <label className="march-volume">
        {volume === 0 ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
        <input
          aria-label="背景音乐音量"
          type="range"
          min="0"
          max="1"
          step=".05"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  )
}
