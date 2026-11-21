import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { MARCH_NODES } from '../src/shared/long-march'
import { MARCH_STORIES, marchStory } from '../src/shared/long-march-stories'
import { storyAudioTiming } from '../src/renderer/src/features/long-march/story-audio-timing'
import {
  activeStorySection,
  storyTime
} from '../src/renderer/src/features/long-march/story-timeline'

describe('Long March story collection and offline narration', () => {
  it('covers all twelve route nodes with reviewed sources, narrative sections and a reflection', () => {
    expect(MARCH_STORIES.map((s) => s.id)).toEqual(MARCH_NODES.map((n) => n.id))
    expect(new Set(MARCH_STORIES.map((s) => s.title)).size).toBe(12)
    for (const story of MARCH_STORIES) {
      expect(story.sources.length).toBeGreaterThan(0)
      expect(story.sources.every((s) => s.url.startsWith('https://'))).toBe(true)
      expect(story.sections).toHaveLength(3)
      expect(story.sections.at(-1)?.reflection).toBe(true)
      expect(marchStory(story.id)).toBe(story)
      expect(story.question.length).toBeGreaterThan(10)
    }
    expect(() => marchStory('unknown')).toThrow()
  })
  it('ships distinct illustration and audio assets, and audio matches the exact current scripts', () => {
    const illustrations = new Set<string>(),
      audios = new Set<string>()
    for (const story of MARCH_STORIES) {
      const directory = 'src/renderer/src/features/long-march/assets/'
      const image = readFileSync(`${directory}stories/${story.id}.png`)
      const reward = readFileSync(`${directory}nodes/${story.id}.png`)
      const audio = readFileSync(`${directory}stories/${story.id}.mp3`)
      const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
      expect(hash(image)).not.toBe(hash(reward))
      illustrations.add(hash(image))
      audios.add(hash(audio))
      expect(audio.length).toBeGreaterThan(100000)
      const timing = storyAudioTiming[story.id]
      expect(timing.scriptHash).toBe(hash(JSON.stringify(story.sections)))
      expect(timing.duration).toBeGreaterThan(60)
      expect(timing.starts).toHaveLength(story.sections.length)
      expect(timing.starts[0]).toBe(0)
      expect(
        timing.starts.every(
          (time, i) => time < timing.duration && (i === 0 || time > timing.starts[i - 1])
        )
      ).toBe(true)
    }
    expect(illustrations.size).toBe(12)
    expect(audios.size).toBe(12)
  })
  it('switches transcript sections at measured audio cues and handles timeline edges', () => {
    const cues = [0, 27, 54]
    expect(activeStorySection(cues, 26.99)).toBe(0)
    expect(activeStorySection(cues, 27)).toBe(1)
    expect(activeStorySection(cues, 85)).toBe(2)
    expect(activeStorySection(cues, 0)).toBe(0)
    expect(storyTime(85.9)).toBe('01:25')
    expect(storyTime(-1)).toBe('00:00')
  })
})
