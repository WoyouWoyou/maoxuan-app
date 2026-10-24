import { describe, expect, it } from 'vitest'
import { DEFAULT_READER_PREFERENCES, speechChunks } from '../src/shared/contracts/reader'
import { validateIpcArguments } from '../src/shared/contracts/ipc'
import {
  configureSettings,
  getReaderPreferences,
  setReaderPreferences
} from '../src/main/modules/settings/public'

describe('reading preferences and speech boundaries', () => {
  it('defaults to centered with speech off and saves separately from model configuration', () => {
    const saved = new Map<string, string>()
    configureSettings({
      read: (key) => saved.get(key) ?? null,
      write: (key, value) => {
        saved.set(key, value)
      },
      transaction: (fn) => fn(),
      readSecret: () => '',
      writeSecret: () => {}
    })
    expect(getReaderPreferences()).toEqual(DEFAULT_READER_PREFERENCES)
    const next = {
      ...DEFAULT_READER_PREFERENCES,
      enabled: true,
      layout: 'full' as const,
      rate: 1.25
    }
    expect(setReaderPreferences(next)).toEqual(next)
    expect([...saved.keys()]).toEqual(['readerPreferences'])
    expect(() => setReaderPreferences({ ...next, rate: 99 })).toThrow()
    expect(getReaderPreferences()).toEqual(next)
  })
  it('rejects malformed synthesis parameters before network access', () => {
    for (const request of [
      { id: 'a', text: '', voice: 'zh-CN-XiaoxiaoNeural' },
      { id: 'a', text: '测试', voice: '<voice>' },
      { id: 'a', text: '中'.repeat(20001), voice: 'zh-CN-XiaoxiaoNeural' },
      { id: 'a', text: '测试', voice: 'zh-CN-XiaoxiaoNeural', url: 'http://example.com' }
    ])
      expect(() => validateIpcArguments('speech:synthesize', [request])).toThrow()
    expect(() =>
      validateIpcArguments('speech:synthesize', [
        { id: 'a', text: '测试', voice: 'zh-CN-XiaoxiaoNeural' }
      ])
    ).not.toThrow()
  })
  it('chunks very long Chinese and astral characters without losing text or splitting codepoints', () => {
    const original = '矛盾的普遍性。'.repeat(300) + '😀'.repeat(500)
    const chunks = speechChunks(original)
    expect(chunks.join('')).toBe(original)
    expect(chunks.every((chunk) => chunk.length <= 701)).toBe(true)
    expect(chunks.every((chunk) => !/[\ud800-\udbff]$/.test(chunk))).toBe(true)
    expect(speechChunks('正文〔12〕\u0000。')).toEqual(['正文。'])
    expect(speechChunks('   ')).toEqual([])
  })
})
