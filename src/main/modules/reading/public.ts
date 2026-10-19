import type { SessionData } from '@shared/types'
import * as mao from './profiles/maoxuan'
import * as generic from './profiles/generic'
function profile(data: SessionData) {
  return data.book?.profile === 'generic' ? generic : mao
}
export const diagnose: typeof mao.diagnose = (s, d) => profile(d).diagnose(s, d)
export const reviseProblem: typeof mao.reviseProblem = (s, d, h) =>
  profile(d).reviseProblem(s, d, h)
export const findPassages: typeof mao.findPassages = (s, d, a) => profile(d).findPassages(s, d, a)
export const reviewNotes: typeof mao.reviewNotes = (s, d, a, n) =>
  profile(d).reviewNotes(s, d, a, n)
export const reviewSituation: typeof mao.reviewSituation = (s, d, n, t) =>
  profile(d).reviewSituation(s, d, n, t)
export const mindset: typeof mao.mindset = (s, d) => profile(d).mindset(s, d)
export const buildChatMessages: typeof mao.buildChatMessages = (d, h, c, a) =>
  profile(d).buildChatMessages(d, h, c, a)
