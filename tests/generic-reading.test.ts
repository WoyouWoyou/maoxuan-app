import { beforeEach, describe, it, expect, vi } from 'vitest'
vi.mock('../src/main/modules/model-runtime/public', () => ({ callJson: vi.fn() }))
vi.mock('../src/main/modules/retrieval/public', () => ({ candidates: vi.fn() }))
import { callJson } from '../src/main/modules/model-runtime/public'
import { candidates } from '../src/main/modules/retrieval/public'
import { diagnose, findPassages } from '../src/main/modules/reading/profiles/generic'
import { emptySessionData } from '../src/shared/types'
const settings = { apiKey: 'fake', baseUrl: 'https://example.invalid', model: 'fake' }
const data = {
  ...emptySessionData(),
  book: {
    bookId: 'book',
    revisionId: 'revision',
    title: '测试书',
    profile: 'generic' as const,
    profileVersion: '1'
  }
}
const article = {
  id: 'chapter',
  title: '真实章节',
  volume: '正文',
  isCore: false,
  coreOrder: null,
  length: 8,
  content: '真实的一段文字。',
  paragraphs: ['真实的一段文字。'],
  paragraphIds: ['chapter:p0']
}
beforeEach(() =>
  vi
    .mocked(candidates)
    .mockResolvedValue([{ article, excerpts: [{ index: 0, text: article.content }] }])
)
describe('generic reading grounded outputs', () => {
  it('rejects fabricated chapter IDs, quotes and duplicate recommendations', async () => {
    vi.mocked(callJson).mockResolvedValue({
      restated: '复述',
      recommendations: [
        { articleId: 'fiction', quote: '真实的一段文字。', paragraphIndex: 0 },
        { articleId: 'chapter', quote: '编造句子', paragraphIndex: 0 },
        {
          articleId: 'chapter',
          quote: '真实的一段文字。',
          paragraphIndex: 0,
          title: '错误标题',
          reason: '相关',
          focusQuestion: '带读问题'
        },
        { articleId: 'chapter', quote: '真实的一段文字。', paragraphIndex: 0 }
      ]
    })
    const result = await diagnose(settings, data)
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].title).toBe('真实章节')
    expect(result.recommendations[0].evidence?.source).toMatchObject({
      bookId: 'book',
      revisionId: 'revision',
      paragraphId: 'chapter:p0'
    })
  })
  it('allows no relevant reading instead of falling back to Mao', async () => {
    vi.mocked(callJson).mockResolvedValue({ restated: '没有合适内容', recommendations: [] })
    expect((await diagnose(settings, data)).recommendations).toEqual([])
  })
  it('never binds invalid AI explanation to a replacement paragraph', async () => {
    vi.mocked(callJson).mockResolvedValue({
      focusQuestion: '问题',
      passages: [{ paragraphIndex: 0, quote: '不存在的原文', why: '编造解释' }]
    })
    expect((await findPassages(settings, data, article)).passages).toEqual([])
  })
})
