import type {
  Article,
  ArticleMeta,
  ChatChunkEvent,
  ChatDoneEvent,
  ChatErrorEvent,
  ChatMessage,
  Diagnosis,
  Mindset,
  NoteFeedback,
  Passage,
  ProblemRevision,
  Review,
  SearchHit,
  Session,
  SessionPatch,
  SessionSummary,
  Settings,
  ThreeNotes,
  Version,
  VersionSummary
} from './types'

/** Exposed by preload as `window.api`. Every method maps 1:1 to an ipcMain.handle channel named `${group}:${method}`. */
export interface MaoxuanApi {
  articles: {
    list(): Promise<ArticleMeta[]>
    get(id: string): Promise<Article | null>
    search(query: string, limit?: number): Promise<SearchHit[]>
  }
  sessions: {
    /** 仅进行中：status='active' 且不在回收站。 */
    list(): Promise<SessionSummary[]>
    /** status='archived' 且不在回收站，按 updatedAt 倒序。 */
    listArchived(): Promise<SessionSummary[]>
    /** 回收站中的会话，按 deletedAt 倒序。 */
    listTrash(): Promise<SessionSummary[]>
    get(id: string): Promise<Session | null>
    create(problemText: string): Promise<Session>
    /** When `versionLabel` is given, a full snapshot is appended to the version history. */
    update(id: string, patch: SessionPatch, versionLabel?: string): Promise<Session>
    /** 彻底删除（级联删除版本与对话），不可恢复。 */
    remove(id: string): Promise<void>
    archive(id: string): Promise<void>
    unarchive(id: string): Promise<void>
    /** 移入回收站，TRASH_RETENTION_DAYS 天后自动彻底删除。 */
    trash(id: string): Promise<void>
    /** 从回收站恢复，保留原 status。 */
    restore(id: string): Promise<void>
    /** 彻底删除回收站中所有会话，返回删除条数。 */
    emptyTrash(): Promise<number>
  }
  versions: {
    list(sessionId: string): Promise<VersionSummary[]>
    get(versionId: string): Promise<Version | null>
    /** Non-destructive: copies the old snapshot into the session and records a new version labelled `恢复自 vN`. */
    restore(versionId: string): Promise<Session>
  }
  chat: {
    list(sessionId: string): Promise<ChatMessage[]>
    /** Persists the user message, starts streaming, resolves immediately with a requestId. */
    send(sessionId: string, content: string, articleId?: string | null): Promise<{ requestId: string; userMessage: ChatMessage }>
    clear(sessionId: string): Promise<void>
    onChunk(cb: (e: ChatChunkEvent) => void): () => void
    onDone(cb: (e: ChatDoneEvent) => void): () => void
    onError(cb: (e: ChatErrorEvent) => void): () => void
  }
  ai: {
    diagnose(sessionId: string): Promise<Diagnosis>
    /** 读取该会话的教练对话，结合当前问题与诊断，给出修订建议（不写库）。 */
    reviseProblem(sessionId: string): Promise<ProblemRevision>
    findPassages(sessionId: string, articleId: string): Promise<{ focusQuestion: string; passages: Passage[] }>
    reviewNotes(sessionId: string, articleId: string, notes: ThreeNotes): Promise<NoteFeedback>
    reviewSituation(sessionId: string, newSituation: string): Promise<Review>
    mindset(sessionId: string): Promise<Mindset>
  }
  settings: {
    get(): Promise<Settings>
    set(s: Settings): Promise<Settings>
    test(): Promise<{ ok: boolean; message: string }>
  }
}
