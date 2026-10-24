import type {
  Article,
  ChatMessage,
  Diagnosis,
  Mindset,
  NoteFeedback,
  Passage,
  ProblemRevision,
  Review,
  SessionData,
  Settings,
  ThreeNotes
} from '@shared/types'
import type { LlmMessage } from '../model-runtime/public'
/** Explicit profile contract; no concrete profile owns the public API. */
export interface ReadingProfile {
  diagnose(s: Settings, data: SessionData): Promise<Diagnosis>
  reviseProblem(s: Settings, data: SessionData, history: ChatMessage[]): Promise<ProblemRevision>
  findPassages(
    s: Settings,
    data: SessionData,
    article: Article
  ): Promise<{ focusQuestion: string; passages: Passage[] }>
  reviewNotes(
    s: Settings,
    data: SessionData,
    article: Article,
    notes: ThreeNotes
  ): Promise<NoteFeedback>
  reviewSituation(
    s: Settings,
    data: SessionData,
    newSituation: string,
    titles: Map<string, string>
  ): Promise<Review>
  mindset(s: Settings, data: SessionData): Promise<Mindset>
  buildChatMessages(
    data: SessionData,
    history: ChatMessage[],
    content: string,
    article: Article | null
  ): LlmMessage[]
}
