import type { SessionData } from '@shared/types'
import * as mao from './profiles/maoxuan'
import * as generic from './profiles/generic'
import type { ReadingProfile } from './profile'
const profiles: Record<string, ReadingProfile> = { maoxuan: mao, generic }
function profile(data: SessionData): ReadingProfile {
  const selected = profiles[data.book?.profile ?? 'maoxuan']
  if (!selected) throw new Error('不支持的阅读策略')
  return selected
}
export const diagnose: ReadingProfile['diagnose'] = (s, d) => profile(d).diagnose(s, d)
export const reviseProblem: ReadingProfile['reviseProblem'] = (s, d, h) =>
  profile(d).reviseProblem(s, d, h)
export const findPassages: ReadingProfile['findPassages'] = (s, d, a) =>
  profile(d).findPassages(s, d, a)
export const reviewNotes: ReadingProfile['reviewNotes'] = (s, d, a, n) =>
  profile(d).reviewNotes(s, d, a, n)
export const reviewSituation: ReadingProfile['reviewSituation'] = (s, d, n, t) =>
  profile(d).reviewSituation(s, d, n, t)
export const mindset: ReadingProfile['mindset'] = (s, d) => profile(d).mindset(s, d)
export const buildChatMessages: ReadingProfile['buildChatMessages'] = (d, h, c, a) =>
  profile(d).buildChatMessages(d, h, c, a)
