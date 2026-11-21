import { describe, expect, it } from 'vitest'
import { sessionLabels, validSessionLabel } from '../src/renderer/src/lib/session-labels'

describe('sidebar session labels', () => {
  it('extracts unique title characters and ignores punctuation', () => {
    const sessions = [{ id: 'a', title: '如何处理工作压力？' }, { id: 'b', title: '如何处理人际关系？' }]
    const labels = sessionLabels(sessions, {})
    expect(labels.a).not.toBe(labels.b)
    for (const session of sessions) expect(session.title).toContain(labels[session.id])
    expect(labels).toEqual(sessionLabels([...sessions].reverse(), {}))
  })
  it('uses distinct pairs from repeated titles before falling back', () => {
    const labels = sessionLabels([{ id: 'a', title: '工作压力' }, { id: 'b', title: '工作压力' }], {})
    expect(labels).toEqual({ a: '工作', b: '作压' })
  })
  it('reserves manual labels before assigning automatic ones', () => {
    expect(sessionLabels([{ id: 'a', title: '工作压力' }, { id: 'b', title: '人际关系' }], { b: '工作' })).toEqual({ a: '作压', b: '工作' })
  })
  it('keeps identical, empty and case-equivalent titles distinct', () => {
    const labels = sessionLabels([{ id: 'a', title: '工' }, { id: 'b', title: '工' }, { id: 'c', title: '' }, { id: 'd', title: 'A' }, { id: 'e', title: 'a' }], {})
    expect(new Set(Object.values(labels).map((label) => label.toLowerCase())).size).toBe(5)
    expect(Object.values(labels).every(validSessionLabel)).toBe(true)
  })
  it('accepts one or two characters and rejects invalid labels', () => {
    for (const value of ['', '三个字', ' ', '!', '🙂', '工 作']) expect(validSessionLabel(value)).toBe(false)
    for (const value of ['问', 'A', '1', '𠮷', '笔记', 'A1', '𠮷野']) expect(validSessionLabel(value)).toBe(true)
  })
})
