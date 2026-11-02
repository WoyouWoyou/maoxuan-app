import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CaretDown, CaretUp, Pause, Play, SpeakerHigh } from '@phosphor-icons/react'
import { marchStory } from '@shared/long-march-stories'
import type { MarchNode } from '@shared/long-march'
import { storyResources } from './story-assets'
import { useStoryNarration } from './useStoryNarration'
import { storyTime } from './story-timeline'
import './story-card.css'

export function MarchStoryCard({ node }: { node: MarchNode }) {
  const story = marchStory(node.id)
  const resources = storyResources(node.id)
  const player = useStoryNarration(node.id)
  const [transcript, setTranscript] = useState(false)
  return (
    <article className="march-story-card" aria-labelledby={`story-title-${node.id}`}>
      <div className="march-story-illustration">
        <img src={resources.image} alt={story.illustration} />
        <span>长征故事 · 插图为历史主题艺术演绎</span>
      </div>
      <div className="march-story-content">
        <span className="march-kicker">听一段故事，再走一段路</span>
        <h2 id={`story-title-${node.id}`}>{story.title}</h2>
        <p className="march-story-summary">{story.summary}</p>
        <audio ref={player.audio} src={resources.audio} preload="metadata" {...player.events} />
        <div className="march-story-player">
          <button
            className="march-story-play"
            aria-label={player.playing ? '暂停故事解说' : '播放故事解说'}
            onClick={player.toggle}
          >
            {player.loading ? (
              <span className="spinner" />
            ) : player.playing ? (
              <Pause weight="fill" size={22} />
            ) : (
              <Play weight="fill" size={22} />
            )}
          </button>
          <div className="march-story-track">
            <div>
              <strong>
                {player.loading
                  ? '正在载入解说…'
                  : player.playing
                    ? '正在讲述'
                    : player.position > 0
                      ? '继续听故事'
                      : '点击听故事'}
              </strong>
              <span>云健解说 · 内置音频</span>
            </div>
            <input
              aria-label="故事播放进度"
              type="range"
              min={0}
              max={player.duration}
              step={0.1}
              value={player.position}
              onChange={(e) => player.seek(Number(e.target.value))}
            />
            <small>
              {storyTime(player.position)} / {storyTime(player.duration)}
            </small>
          </div>
          <label className="march-story-rate">
            <span className="sr-only">故事播放速度</span>
            <select
              aria-label="故事播放速度"
              value={player.rate}
              onChange={(e) => player.setRate(Number(e.target.value))}
            >
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>
          <label className="march-story-volume">
            <SpeakerHigh size={18} />
            <input
              aria-label="故事音量"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={player.volume}
              onChange={(e) => player.setVolume(Number(e.target.value))}
            />
          </label>
        </div>
        {player.error && (
          <p className="march-story-error" role="alert">
            {player.error}
          </p>
        )}
        <div className="march-story-current" aria-label="当前解说段落">
          <span>
            {String(player.activeSection + 1).padStart(2, '0')} /{' '}
            {String(story.sections.length).padStart(2, '0')}
          </span>
          <div>
            <h3>{story.sections[player.activeSection].title}</h3>
            <p>{story.sections[player.activeSection].text}</p>
          </div>
        </div>
        <button
          className="march-text-button march-transcript-toggle"
          aria-expanded={transcript}
          aria-controls={`story-transcript-${node.id}`}
          onClick={() => setTranscript((v) => !v)}
        >
          <BookOpen size={17} />
          {transcript ? '收起完整文字稿' : '阅读完整文字稿'}
          {transcript ? <CaretUp /> : <CaretDown />}
        </button>
        {transcript && (
          <div id={`story-transcript-${node.id}`} className="march-story-transcript">
            {story.sections.map((section, i) => (
              <section
                key={section.title}
                className={player.activeSection === i ? 'is-active' : ''}
                aria-current={player.activeSection === i ? 'step' : undefined}
              >
                <div>
                  <span>{section.reflection ? '阅读提示' : '历史叙述'}</span>
                  <button
                    aria-label={`从${section.title}开始听`}
                    onClick={() => player.playSection(i)}
                  >
                    <Play size={12} /> 从这里听
                  </button>
                </div>
                <h3>{section.title}</h3>
                <p>{section.text}</p>
              </section>
            ))}
          </div>
        )}
        <aside className="march-story-question">
          <span>带着一个问题前行</span>
          <p>{story.question}</p>
          <Link className="march-reading-link" to="/journal">
            去日常记录，写下我的思考
          </Link>
        </aside>
        <details className="march-story-sources">
          <summary>史料来源与创作说明</summary>
          <p>
            依据以下资料整理；阅读提示为编者引导，插图不作精确场景复原，不虚构人物对白。语音为合成解说。
          </p>
          <ul>
            {story.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
        <p className="march-story-reward-note">
          这里先听故事；完整风景与《晴天》配乐将在本站解锁后呈现。
        </p>
      </div>
    </article>
  )
}
