import type { Article, ArticleMeta, Settings, SearchHit } from '@shared/types'
import type { BookScope } from '@shared/contracts/library'
import type { CallJson } from './ports'
export interface QueryContext {
  text: string
  background: string
  tried: string
}
export function createCandidateRetriever(ports: {
  callJson: CallJson
  listChapters: (scope: BookScope) => ArticleMeta[]
  getChapter: (id: string, scope: BookScope) => Article | null
  searchChapters: (q: string, limit: number, scope: BookScope) => SearchHit[]
  repo: { get: (id: string) => { summary: string } | undefined }
}) {
  const { callJson, listChapters, getChapter, searchChapters, repo } = ports
  async function candidates(
    settings: Settings,
    query: QueryContext,
    scope: BookScope
  ): Promise<{ article: Article; excerpts: { index: number; text: string }[] }[]> {
    const chapters = listChapters(scope)
    const problem = [query.text, query.background, query.tried].join('\n')
    const expanded = await callJson<{ terms?: string[] }>(
      settings,
      '从用户问题提取用于书籍检索的中文关键词和同义表达，最多10个，每项2至8字。只输出 JSON {"terms":[]}。',
      problem
    )
    const terms = [
      ...new Set(
        (Array.isArray(expanded?.terms) ? expanded.terms : [])
          .filter((t) => typeof t === 'string' && t.length >= 2 && t.length <= 20)
          .slice(0, 10)
      )
    ]
    const score = new Map<string, number>()
    for (const term of terms)
      for (const hit of searchChapters(term, 100, scope))
        score.set(hit.id, (score.get(hit.id) ?? 0) + 3)
    for (const c of chapters)
      for (const term of terms)
        if ((c.title + ' ' + (repo.get(c.id)?.summary ?? '')).includes(term))
          score.set(c.id, (score.get(c.id) ?? 0) + 5)
    const small = chapters.reduce((n, c) => n + c.length, 0) <= 42000
    const selected = small
      ? chapters
      : [...chapters].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)).slice(0, 12)
    let budget = 45000
    const result: { article: Article; excerpts: { index: number; text: string }[] }[] = []
    for (const meta of selected) {
      if (budget < 300) break
      const article = getChapter(meta.id, scope)!
      const ranked = article.paragraphs.map((text, index) => ({
        index,
        text,
        score: terms.reduce((n, t) => n + (text.includes(t) ? t.length : 0), 0)
      }))
      if (!small) ranked.sort((a, b) => b.score - a.score || a.index - b.index)
      const excerpts: { index: number; text: string }[] = []
      let local = small ? budget : Math.min(4500, budget)
      for (const p of ranked) {
        if (p.text.length > local) continue
        excerpts.push(p)
        local -= p.text.length
        budget -= p.text.length
      }
      excerpts.sort((a, b) => a.index - b.index)
      if (excerpts.length) result.push({ article, excerpts })
    }
    return result
  }

  return { candidates }
}
