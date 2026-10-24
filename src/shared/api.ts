import type { ActionEdit } from './actions'
import type { ActionItem } from './types'
import type { ActionReference, ClassificationResult } from './contracts/action-planning'
import type { ReaderPreferences, SpeechRequest } from './contracts/reader'
import type { ProxySettings } from './contracts/proxy'
import type { WorkbenchCommand } from './contracts/workbench'
import type { ModelProfile } from './contracts/models'
import type { ReadingCommand } from './contracts/reading'
import type { StepKey } from './types'
import type { Book, BookScope, Task, ImportEdits } from './contracts/library'
import type { UsageQuery, UsageStats } from './contracts/usage'
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
  SessionMode,
  SessionPatch,
  SessionSummary,
  Settings,
  ThreeNotes,
  Version,
  VersionSummary,
  WbAction,
  WbCheck,
  WbContradiction,
  WbDecision,
  WbIntake,
  WbObjSubj,
  WbRecapInput,
  WbRecapResult,
  WbRoutes
} from './types'

/** Exposed by preload as `window.api`. Every method maps 1:1 to an ipcMain.handle channel named `${group}:${method}`. */
export interface MaoxuanApi {
  actions: {
    list(): Promise<ActionItem[]>
    create(edit: ActionEdit): Promise<ActionItem>
    edit(id: string, edit: ActionEdit, progress?: string): Promise<ActionItem>
    classify(refs: ActionReference[], today: string): Promise<ClassificationResult>
  }
  speech: {
    synthesize(request: SpeechRequest): Promise<Uint8Array>
    prefetch(request: SpeechRequest): Promise<void>
    cancel(id: string): Promise<void>
  }

  reading: {
    apply(
      id: string,
      commands: ReadingCommand[],
      expectedStateVersion: number,
      label?: string,
      step?: StepKey,
      mutationId?: string
    ): Promise<Session>
  }
  library: {
    list(includeHidden?: boolean): Promise<Book[]>
    hide(id: string, hidden: boolean): Promise<void>
    choose(encoding?: string): Promise<string | null>
    confirm(id: string, title: string, author: string, edits?: ImportEdits): Promise<string>
    index(bookId: string): Promise<Task>
  }
  tasks: {
    list(): Promise<Task[]>
    get(id: string): Promise<Task>
    cancel(id: string): Promise<void>
    onChanged(cb: (task: Task) => void): () => void
  }
  usage: { query(query?: UsageQuery): Promise<UsageStats> }
  models: {
    routes(): Promise<Record<string, string>>
    setRoute(purpose: string, id: string): Promise<void>
    cancel(sessionId: string): Promise<void>
    list(): Promise<ModelProfile[]>
    save(id: string | undefined, name: string, settings: Settings): Promise<ModelProfile>
    select(id: string): Promise<void>
  }
  articles: {
    list(scope?: BookScope): Promise<ArticleMeta[]>
    get(id: string, scope?: BookScope): Promise<Article | null>
    search(query: string, limit?: number, scope?: BookScope): Promise<SearchHit[]>
  }
  sessions: {
    /** 仅进行中：status='active' 且不在回收站。 */
    list(): Promise<SessionSummary[]>
    /** status='archived' 且不在回收站，按 updatedAt 倒序。 */
    listArchived(): Promise<SessionSummary[]>
    /** 回收站中的会话，按 deletedAt 倒序。 */
    listTrash(): Promise<SessionSummary[]>
    get(id: string): Promise<Session | null>
    /** mode 缺省为 reading。workbench 会话：problemText 写入 form.objective，currentStep = 'wb_intake'。 */
    create(problemText: string, mode?: SessionMode, bookId?: string): Promise<Session>
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
    restore(versionId: string, expectedStateVersion: number, mutationId?: string): Promise<Session>
  }
  chat: {
    list(sessionId: string): Promise<ChatMessage[]>
    /** Persists the user message, starts streaming, resolves immediately with a requestId. */
    send(
      sessionId: string,
      content: string,
      articleId?: string | null
    ): Promise<{ requestId: string; userMessage: ChatMessage }>
    clear(sessionId: string): Promise<void>
    onChunk(cb: (e: ChatChunkEvent) => void): () => void
    onDone(cb: (e: ChatDoneEvent) => void): () => void
    onError(cb: (e: ChatErrorEvent) => void): () => void
  }
  ai: {
    diagnose(sessionId: string): Promise<Diagnosis>
    /** 读取该会话的教练对话，结合当前问题与诊断，给出修订建议（不写库）。 */
    reviseProblem(sessionId: string): Promise<ProblemRevision>
    findPassages(
      sessionId: string,
      articleId: string
    ): Promise<{ focusQuestion: string; passages: Passage[] }>
    reviewNotes(sessionId: string, articleId: string, notes: ThreeNotes): Promise<NoteFeedback>
    reviewSituation(sessionId: string, newSituation: string): Promise<Review>
    mindset(sessionId: string): Promise<Mindset>
  }
  /**
   * 毛选工作台。生成接口返回待确认建议；内容变更统一通过 wb.apply 命令写入。
   * 会话不是 workbench 模式时抛错。
   */
  wb: {
    apply(
      id: string,
      commands: WorkbenchCommand[],
      expectedStateVersion: number,
      label?: string,
      step?: StepKey,
      mutationId?: string
    ): Promise<Session>
    /** 整理 form + 已回答的追问 + 现有事实台账，输出新的 WbIntake（事实 id 延续旧台账）。 */
    intake(sessionId: string): Promise<WbIntake>
    contradiction(sessionId: string): Promise<WbContradiction>
    routes(sessionId: string): Promise<WbRoutes>
    objSubj(sessionId: string): Promise<WbObjSubj>
    /** 综合三模块 → 决策快照，并附带硬规则 + 红队检查。若已有决策且有未通过检查，则按检查意见修复。 */
    decide(sessionId: string): Promise<WbDecision>
    /** 对当前（可能被用户改过的）决策重新跑硬规则 + 红队检查。 */
    recheck(sessionId: string): Promise<WbCheck[]>
    /** 基于已确认的决策生成 7/30/90 天行动，并附带检查。 */
    actions(sessionId: string): Promise<{ actions: WbAction[]; checks: WbCheck[] }>
    recap(sessionId: string, input: WbRecapInput): Promise<WbRecapResult>
  }
  settings: {
    getReader(): Promise<ReaderPreferences>
    setReader(preferences: ReaderPreferences): Promise<ReaderPreferences>

    getProxy(): Promise<ProxySettings>
    setProxy(settings: ProxySettings): Promise<ProxySettings>
    get(): Promise<Settings>
    set(s: Settings): Promise<Settings>
    test(): Promise<{ ok: boolean; message: string }>
  }
}
