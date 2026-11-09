import { assetEntityId, encodeAsset, decodeAsset, assetHash } from '@shared/sync/assets'
import { synchronize } from './sync'
import { mobileMarch } from './march'
import { createActionClassifier } from '@shared/engine/action-classifier'
import { actionEditSchema } from '@shared/contracts/action-planning'
import type { ActionItem } from '@shared/types'
import type { ActionEdit } from '@shared/actions'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { createSessionService } from '@shared/engine/session'
import type { SessionRepository } from '@shared/engine/session-ports'
import { createJournalService } from '@shared/engine/journal'
import { applyReadingCommands } from '@shared/engine/reading-reducer'
import { applyWorkbenchCommands } from '@shared/engine/workbench-reducer'
import { createReadingValidator } from '@shared/engine/reading-validation'
import { createWorkbenchValidator } from '@shared/engine/workbench-validation'
import { readingInput } from '@shared/engine/reading-input'
import { workbenchInput } from '@shared/engine/workbench-input'
import { createMaoxuanProfile } from '@shared/engine/maoxuan'
import { createCandidateRetriever } from '@shared/engine/retrieval'
import { createGenericProfile } from '@shared/engine/generic'
import { createWorkbenchAI } from '@shared/engine/workbench-ai'
import { createNotesDrafter } from '@shared/engine/notes-draft'
import { selectedWorkbench } from '@shared/workbench'
import { thinkingResultSchema } from '@shared/contracts/state-schema'
import * as schemas from '@shared/contracts/state-schema'
import { array, object, text, bool } from '@shared/contracts/validation'
import { DEFAULT_READER_PREFERENCES } from '@shared/contracts/reader'
import { journalCommandSchema } from '@shared/contracts/journal'
import type { MaoxuanApi } from '@shared/api'
import type {
  Session,
  Settings,
  Article as DesktopArticle,
  AIContext,
  SessionData,
  Version,
  ChatMessage
} from '@shared/types'
import type { Book, BookScope } from '@shared/contracts/library'
import type { JournalState } from '@shared/journal'
import type { AtomicStore } from './ports'
import { normalizeSessionSources, type SessionRecord, type DesktopPayload } from './desktop-record'
import { createModelTransport } from '../adapters/model'
import type { SecretStore } from '../adapters/secrets'
import type { JournalNote } from '@shared/journal'
import { newMeta, paragraphs, type Article, type Entity } from '../domain/models'
const hash = (text: string) => bytesToHex(sha256(utf8ToBytes(text)))
const fingerprint = (v: unknown) =>
  hash(JSON.stringify(v, (key, value) => (key === '_context' ? undefined : value)))
type Stored = Extract<Entity, { kind: 'desktop' }>
export async function createDesktopApi(
  store: AtomicStore,
  builtins: Article[],
  secrets?: SecretStore,
  documents: { choose: () => Promise<File[]>; export: (notes: JournalNote[]) => Promise<void> } = {
    choose: async () => [],
    export: async () => {
      throw new Error('文件导出未接入')
    }
  }
) {
  let entities: Entity[] = []
  let tail: Promise<unknown> = Promise.resolve()
  const runtime = createModelTransport()
  let key = ''
  async function load() {
    entities = (await store.snapshot()).entities
    for (const entity of entities) {
      if (entity.kind === 'desktop' && entity.payload.type === 'session') {
        const record = entity.payload.value
        normalizeSessionSources(record.session.data)
        record.versions.forEach((version) => normalizeSessionSources(version.data))
      }
    }
  }
  await load()
  const stored = (id: string) =>
    entities.find((e): e is Stored => e.kind === 'desktop' && e.id === id)
  const settingsRecord = () => stored('desktop:settings')
  const config = () => {
    const p = settingsRecord()?.payload
    return p?.type === 'settings' ? p.value : {}
  }
  async function persist(id: string, payload: DesktopPayload) {
    if (payload.type === 'session') {
      normalizeSessionSources(payload.value.session.data)
      payload.value.versions.forEach((version) => normalizeSessionSources(version.data))
    }
    const prior = stored(id)
    const e: Stored = {
      ...(prior ?? newMeta()),
      id,
      kind: 'desktop',
      version: (prior?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      payload
    }
    await store.commit({
      entity: e,
      expectedVersion: prior?.version ?? 0,
      operationId: crypto.randomUUID()
    })
    await load()
  }
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(async () => {
      await load()
      return fn()
    })
    tail = next.catch(() => {})
    return next
  }
  function records() {
    return entities
      .filter((e): e is Stored => e.kind === 'desktop' && e.payload.type === 'session')
      .map((e) => (e.payload as { type: 'session'; value: SessionRecord }).value)
  }
  const scopeOf = (d: SessionData): BookScope => ({
    bookId: d.book?.bookId ?? 'maoxuan',
    revisionId: d.book?.revisionId ?? 'maoxuan-v1'
  })
  function articles(scope?: BookScope): DesktopArticle[] {
    const imported = entities.filter((e) => e.kind === 'book')
    const source =
      !scope || scope.bookId === 'maoxuan'
        ? builtins
        : imported
            .filter((b) => b.id === scope.bookId)
            .map((b) => ({ ...b, volume: '导入书籍', isCore: false, coreOrder: null }))
    return source.map((a) => ({
      ...a,
      bookId: scope?.bookId ?? 'maoxuan',
      revisionId: scope?.revisionId ?? 'maoxuan-v1',
      length: a.content.length,
      paragraphs: a.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
      paragraphIds: a.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((_, i) => `${a.id}:p${i}`)
    }))
  }
  const getChapter = (id: string, scope?: BookScope) =>
    articles(scope).find((a) => a.id === id) ?? null
  function books(): Book[] {
    return [
      {
        bookId: 'maoxuan',
        revisionId: 'maoxuan-v1',
        title: '毛泽东选集',
        author: '毛泽东',
        format: 'builtin',
        profile: 'maoxuan',
        chapters: builtins.length,
        characters: builtins.reduce((n, a) => n + a.content.length, 0),
        createdAt: '2026-11-01T00:00:00.000Z',
        hidden: false,
        indexed: builtins.length
      },
      ...entities
        .filter((e) => e.kind === 'book')
        .map((b) => ({
          bookId: b.id,
          revisionId: b.revisionId,
          title: b.title,
          author: '',
          format: 'txt' as const,
          profile: 'generic' as const,
          chapters: 1,
          characters: b.content.length,
          createdAt: b.updatedAt,
          hidden: false,
          indexed: 1
        }))
    ]
  }
  const assertContext = (
    s: Session,
    v: { _context?: AIContext } | null | undefined,
    old?: { _context?: AIContext } | null
  ) => {
    const c = v?._context
    if (!c || JSON.stringify(v) === JSON.stringify(old)) return
    if (
      c.requestId &&
      c.requestId === old?._context?.requestId &&
      JSON.stringify(c) === JSON.stringify(old?._context)
    )
      return
    if (
      c.sessionId !== s.id ||
      c.revisionId !== scopeOf(s.data).revisionId ||
      c.profileVersion !== (s.data.book?.profileVersion ?? '1') ||
      c.problemSignature !== fingerprint(s.data.problem)
    )
      throw new Error('AI 结果已过时或不属于当前会话，请重新生成')
    const input = c.purpose?.startsWith('wb_')
      ? workbenchInput(s.data, c.purpose)
      : readingInput(s.data, c.purpose!, c.articleId)
    if (c.inputSignature !== fingerprint(input))
      throw new Error('AI 结果已过时，请基于当前内容重新生成')
    if (
      c.conversationSignature &&
      c.conversationSignature !==
        fingerprint(
          records()
            .find((r) => r.session.id === s.id)
            ?.messages.slice(-30) ?? []
        )
    )
      throw new Error('讨论已变化，请重新生成问题修订建议')
  }
  const { validateReadingSession } = createReadingValidator({
    getChapter,
    scopeOf,
    fingerprint,
    assertReadingContext: assertContext,
    readingInput
  })
  const { validateWorkbenchSession } = createWorkbenchValidator({
    assertWorkbenchContext: assertContext
  })
  // Stage the existing synchronous desktop service in an isolated snapshot, then
  // commit the complete changed session/versions/messages/receipts in one async CAS.
  async function useService<T>(
    work: (service: ReturnType<typeof createSessionService>) => T,
    write = false,
    firstId?: string
  ): Promise<T> {
    const run = async () => {
      const data = new Map(records().map((r) => [r.session.id, structuredClone(r)]))
      const dirty = new Set<string>()
      const require = (id: string) => {
        const r = data.get(id)
        if (!r) throw new Error('会话不存在')
        return r
      }
      const repo: SessionRepository = {
        transaction: (fn) => fn(),
        get: (id) => data.get(id)?.session ?? null,
        list: (filter) =>
          [...data.values()]
            .map((r) => r.session)
            .filter((s) =>
              filter === 'trash' ? !!s.deletedAt : !s.deletedAt && s.status === filter
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        insert: (s) => {
          data.set(s.id, { session: s, versions: [], messages: [], receipts: {}, chatEpoch: 0 })
          dirty.add(s.id)
        },
        save: (s) => {
          require(s.id).session = s
          dirty.add(s.id)
        },
        delete: () => {
          throw new Error('当前移动版仅支持回收站，暂不支持彻底删除')
        },
        purge: () => {
          throw new Error('暂不支持清空回收站')
        },
        versions: (id) => require(id).versions.slice().reverse(),
        version: (id) =>
          [...data.values()].flatMap((r) => r.versions).find((v) => v.id === id) ?? null,
        snapshot: (v) => {
          require(v.sessionId).versions.push(structuredClone(v))
          dirty.add(v.sessionId)
        },
        receipt: (id, m) => require(id).receipts[m],
        remember: (id, m, s) => {
          require(id).receipts[m] = s
          dirty.add(id)
        },
        messages: (id) => require(id).messages,
        addMessage: (m) => {
          require(m.sessionId).messages.push(m)
          dirty.add(m.sessionId)
        },
        clearMessages: (id) => {
          const r = require(id)
          r.messages = []
          r.chatEpoch++
          dirty.add(id)
        }
      }
      const service = createSessionService(
        repo,
        {
          requireBook: (id) => {
            const book = books().find((b) => b.bookId === id)
            if (!book) throw new Error('书籍不存在')
            return book
          },
          validate: (s, d, restoring, step) =>
            s.mode === 'reading'
              ? validateReadingSession(s, d, restoring, step)
              : validateWorkbenchSession(s, d, restoring, step)
        },
        {
          randomUUID: () => {
            const id = firstId
            firstId = undefined
            return id ?? crypto.randomUUID()
          },
          hash
        }
      )
      const result = work(service)
      if (write) {
        if (dirty.size > 1) throw new Error('不支持跨会话非原子提交')
        for (const id of dirty)
          await persist(`desktop:session:${id}`, { type: 'session', value: require(id) })
      }
      return structuredClone(result)
    }
    return write ? exclusive(run) : run()
  }
  const getSession = (id: string) => useService((s) => s.requireSession(id))
  const actualSettings = (): Settings => ({
    baseUrl: String(config().baseUrl ?? 'https://api.deepseek.com/v1'),
    model: String(config().model ?? 'deepseek-chat'),
    apiKey: key,
    hasApiKey: !!key,
    temperatureEnabled: false
  })
  const context = (s: Session, purpose: string, articleId?: string): AIContext => ({
    requestId: crypto.randomUUID(),
    sessionId: s.id,
    purpose,
    articleId,
    profileVersion: s.data.book?.profileVersion ?? '1',
    problemSignature: fingerprint(s.data.problem),
    revisionId: scopeOf(s.data).revisionId,
    inputSignature: fingerprint(
      purpose.startsWith('wb_')
        ? workbenchInput(s.data, purpose)
        : readingInput(s.data, purpose, articleId)
    ),
    ...(purpose === 'reviseProblem'
      ? {
          conversationSignature: fingerprint(
            records()
              .find((r) => r.session.id === s.id)
              ?.messages.slice(-30) ?? []
          )
        }
      : {})
  })
  function profile(id: string, data: SessionData) {
    const ports = { callJson: runtime.json(id), randomUUID: () => crypto.randomUUID() }
    return data.book?.profile === 'generic'
      ? createGenericProfile({
          ...ports,
          getChapter,
          scopeOf,
          candidates: createCandidateRetriever({
            callJson: ports.callJson,
            listChapters: (scope) => articles(scope),
            getChapter,
            searchChapters: (q, limit, scope) =>
              articles(scope)
                .filter((a) => (a.title + a.content).includes(q))
                .slice(0, limit)
                .map((a) => ({
                  id: a.id,
                  title: a.title,
                  volume: a.volume,
                  snippet: a.content.slice(0, 100)
                })),
            repo: { get: () => undefined }
          }).candidates
        })
      : createMaoxuanProfile(ports)
  }
  async function generate<T>(
    id: string,
    purpose: string,
    run: (s: Session) => Promise<T>,
    validate: (r: unknown, p: string) => void,
    attach: (r: T, c: AIContext) => void,
    articleId?: string
  ) {
    const s = await getSession(id)
    if (s.mode !== 'reading') throw new Error('阅读会话不存在')
    const c = context(s, purpose, articleId)
    const result = await run(s)
    validate(result, 'result')
    assertContext(await getSession(id), { _context: c })
    attach(result, c)
    return result
  }
  const api = {
    articles: {
      list: async (scope?: BookScope) => articles(scope),
      get: async (id: string, scope?: BookScope) => getChapter(id, scope),
      search: async (q: string, limit = 50, scope?: BookScope) =>
        articles(scope)
          .filter((a) => (a.title + a.content).includes(q))
          .slice(0, limit)
          .map((a) => ({
            id: a.id,
            title: a.title,
            volume: a.volume,
            snippet: a.content.slice(
              Math.max(0, a.content.indexOf(q) - 20),
              a.content.indexOf(q) + 100
            )
          }))
    },
    library: { list: async () => books() },
    sessions: {
      list: () => useService((s) => s.listSessions()),
      listArchived: () => useService((s) => s.listArchivedSessions()),
      listTrash: () => useService((s) => s.listTrashSessions()),
      get: (id: string) => useService((s) => s.getSession(id)),
      create: (title: string, mode: 'reading' | 'workbench' = 'reading', bookId = 'maoxuan') =>
        useService((s) => s.createSession(title, mode, bookId), true),
      update: (
        id: string,
        patch: Parameters<MaoxuanApi['sessions']['update']>[1],
        label?: string
      ) =>
        useService(
          (s) =>
            s.updateSession(
              id,
              { ...patch, mutationId: patch.mutationId ?? crypto.randomUUID() },
              label
            ),
          true
        ),
      archive: (id: string) => useService((s) => s.archiveSession(id), true),
      unarchive: (id: string) => useService((s) => s.unarchiveSession(id), true),
      trash: (id: string) => useService((s) => s.trashSession(id), true),
      restore: (id: string) => useService((s) => s.restoreSession(id), true)
    },
    reading: {
      apply: (
        id: string,
        commands: Parameters<MaoxuanApi['reading']['apply']>[1],
        expected: number,
        label?: string,
        step?: Session['currentStep'],
        mutationId: string = crypto.randomUUID()
      ) =>
        useService(
          (s) =>
            s.mutateSession(
              id,
              expected,
              mutationId,
              { commands, step },
              (current) => {
                if (current.mode !== 'reading') throw new Error('阅读会话不存在')
                return {
                  data: applyReadingCommands(current.data, commands),
                  currentStep: step ?? current.currentStep
                }
              },
              label
            ),
          true
        )
    },
    versions: {
      list: (id: string) => useService((s) => s.listVersions(id)),
      get: (id: string) => useService((s) => s.getVersion(id)),
      restore: (id: string, expected: number, mutationId: string = crypto.randomUUID()) =>
        useService((s) => s.restoreVersion(id, expected, mutationId), true)
    },
    ai: {
      diagnose: (id: string) =>
        generate(
          id,
          'diagnose',
          (s) => profile(id, s.data).diagnose(actualSettings(), s.data),
          schemas.diagnosisSchema,
          (r, c) => {
            r._context = c
          }
        ),
      reviseProblem: (id: string) =>
        generate(
          id,
          'reviseProblem',
          async (s) =>
            profile(id, s.data).reviseProblem(
              actualSettings(),
              s.data,
              await useService((v) => v.listMessages(id))
            ),
          object({
            problem: schemas.problemSchema,
            diagnosis: schemas.diagnosisSchema,
            changes: array(text)
          }),
          (r, c) => {
            r.diagnosis._context = c
          }
        ),
      findPassages: (id: string, articleId: string) =>
        generate(
          id,
          'findPassages',
          (s) =>
            profile(id, s.data).findPassages(
              actualSettings(),
              s.data,
              getChapter(articleId, scopeOf(s.data))!
            ),
          object({ focusQuestion: text, passages: array(schemas.passageSchema) }),
          (r, c) => {
            r.passages.forEach((p) => (p._context = c))
          },
          articleId
        ),
      draftNotes: (id: string, articleId: string) =>
        generate(
          id,
          'draftNotes',
          (s) =>
            createNotesDrafter(runtime.json(id)).draftNotes(
              actualSettings(),
              s.data,
              getChapter(articleId, scopeOf(s.data))!
            ),
          schemas.notesSchema,
          () => {},
          articleId
        ),
      reviewNotes: (
        id: string,
        articleId: string,
        notes: Parameters<MaoxuanApi['ai']['reviewNotes']>[2]
      ) =>
        generate(
          id,
          'reviewNotes',
          (s) => {
            if (
              JSON.stringify(s.data.readings.find((r) => r.articleId === articleId)?.notes) !==
              JSON.stringify(notes)
            )
              throw new Error('请先保存当前笔记')
            return profile(id, s.data).reviewNotes(
              actualSettings(),
              s.data,
              getChapter(articleId, scopeOf(s.data))!,
              notes
            )
          },
          schemas.feedbackSchema,
          (r, c) => {
            r._context = c
          },
          articleId
        ),
      reviewSituation: (id: string, situation: string) =>
        generate(
          id,
          'reviewSituation',
          (s) =>
            profile(id, s.data).reviewSituation(
              actualSettings(),
              s.data,
              situation,
              new Map(articles(scopeOf(s.data)).map((a) => [a.id, a.title]))
            ),
          schemas.reviewSchema,
          (r, c) => {
            r._context = c
          }
        ),
      mindset: (id: string) =>
        generate(
          id,
          'mindset',
          (s) => profile(id, s.data).mindset(actualSettings(), s.data),
          schemas.mindsetSchema,
          (r, c) => {
            r._context = c
          }
        )
    },
    wb: {
      apply: (
        id: string,
        commands: Parameters<MaoxuanApi['wb']['apply']>[1],
        expected: number,
        label?: string,
        step?: Session['currentStep'],
        mutationId: string = crypto.randomUUID()
      ) =>
        useService(
          (s) =>
            s.mutateSession(
              id,
              expected,
              mutationId,
              { commands, step },
              (current) => {
                if (current.mode !== 'workbench' || !current.data.workbench)
                  throw new Error('工作台会话不存在')
                return {
                  data: {
                    ...current.data,
                    workbench: applyWorkbenchCommands(current.data.workbench, commands)
                  },
                  currentStep: step ?? current.currentStep
                }
              },
              label
            ),
          true
        )
    },
    models: { cancel: async (id: string) => runtime.cancel(id) },
    settings: {
      get: async () => ({ ...actualSettings(), apiKey: '' }),
      set: async (s: Settings) => {
        if (s.apiKey) {
          key = s.apiKey
          if (secure) await secure.set('model-key', key)
        }
        await exclusive(() =>
          persist('desktop:settings', {
            type: 'settings',
            value: { ...config(), baseUrl: s.baseUrl, model: s.model }
          })
        )
        return { ...s, apiKey: '', hasApiKey: !!key }
      },
      test: async () => {
        await runtime.json('settings')(actualSettings(), '返回 JSON。', '{"ok":true}')
        return { ok: true, message: '连接成功' }
      },
      getReader: async () => ({
        ...DEFAULT_READER_PREFERENCES,
        provider: 'system',
        ...((config().reader as object) ?? {})
      }),
      setReader: async (reader: unknown) => {
        await exclusive(() =>
          persist('desktop:settings', { type: 'settings', value: { ...config(), reader } })
        )
        return reader
      },
      getFeatures: async () => ({ longMarch: false })
    }
  }
  // Native keys use Keychain/Keystore; browser keys deliberately stay in memory.
  const secure = secrets
  if (secure) key = await secure.get('model-key')
  const wbOperations = {
    think: 'wbThink',
    intake: 'wbIntake',
    contradiction: 'wbContradiction',
    routes: 'wbRoutes',
    objSubj: 'wbObjSubj',
    decide: 'wbDecide',
    recheck: 'wbRecheck',
    actions: 'wbActions',
    recap: 'wbRecap'
  } as const
  const wbSchemas = {
    think: thinkingResultSchema,
    intake: schemas.intakeSchema,
    contradiction: schemas.contradictionSchema,
    routes: schemas.routesSchema,
    objSubj: schemas.objSubjSchema,
    decide: schemas.decisionSchema,
    recheck: array(schemas.checkSchema),
    actions: object({ actions: array(schemas.wbActionSchema), checks: array(schemas.checkSchema) }),
    recap: object({
      entry: schemas.ledgerSchema,
      newFacts: array(object({ id: text, kind: text, content: text, confidence: text })),
      rediagnose: bool,
      rediagnoseReason: text
    })
  }
  for (const operation of Object.keys(wbOperations) as (keyof typeof wbOperations)[]) {
    Object.assign(api.wb, {
      [operation]: async (id: string, input?: unknown) => {
        const s = await getSession(id)
        if (s.mode !== 'workbench' || !s.data.workbench) throw new Error('工作台会话不存在')
        const c = context(s, `wb_${operation}`),
          generation = createWorkbenchAI({
            callJson: runtime.json(id),
            randomUUID: () => crypto.randomUUID()
          })
        const wb = ['think', 'intake', 'contradiction', 'routes', 'objSubj'].includes(operation)
          ? s.data.workbench
          : selectedWorkbench(s.data.workbench)
        // The signature varies only for decision revision and recap input.
        const fn = generation[wbOperations[operation]] as (...args: any[]) => Promise<any>
        const result = await fn(actualSettings(), wb, input)
        wbSchemas[operation](result, 'workbenchResult')
        assertContext(await getSession(id), { _context: c })
        if (operation === 'recheck') result.forEach((v: any) => (v._context = c))
        else if (operation === 'actions') {
          result.actions.forEach((v: any) => (v._context = c))
          result.checks.forEach((v: any) => (v._context = c))
        } else if (operation === 'recap') result.entry._context = c
        else {
          result._context = c
          if (operation === 'think') result.actions.forEach((v: any) => (v._context = c))
        }
        return result
      }
    })
  }
  const chunkListeners = new Set<(e: any) => void>(),
    doneListeners = new Set<(e: any) => void>(),
    errorListeners = new Set<(e: any) => void>()
  const listen = (set: Set<(e: any) => void>) => (cb: (e: any) => void) => {
    set.add(cb)
    return () => set.delete(cb)
  }
  const chat = {
    list: (id: string) => useService((s) => s.listMessages(id)),
    clear: async (id: string) => {
      runtime.cancel(id)
      await useService((s) => s.clearMessages(id), true)
    },
    onChunk: listen(chunkListeners),
    onDone: listen(doneListeners),
    onError: listen(errorListeners),
    send: async (id: string, content: string, articleId?: string | null) => {
      const userMessage = await useService(
        (s) => s.addMessage(id, 'user', content, articleId),
        true
      )
      const requestId = crypto.randomUUID(),
        s = await getSession(id),
        record = records().find((r) => r.session.id === id)!,
        epoch = record.chatEpoch
      const history = record.messages.filter((m) => m.id !== userMessage.id).slice(-30)
      const messages =
        s.mode === 'workbench'
          ? createWorkbenchAI({
              callJson: runtime.json(id),
              randomUUID: () => crypto.randomUUID()
            }).buildWbChatMessages(s.data.workbench!, history, content)
          : profile(id, s.data).buildChatMessages(
              s.data,
              history,
              content,
              articleId ? getChapter(articleId, scopeOf(s.data)) : null
            )
      // Defer the request until the caller has registered its request ID.
      setTimeout(() => {
        void runtime
          .request(id, actualSettings(), messages, (delta) =>
            chunkListeners.forEach((cb) => cb({ requestId, delta }))
          )
          .then(async (text) => {
            await exclusive(async () => {
              if (records().find((r) => r.session.id === id)?.chatEpoch !== epoch) return
            })
            if (records().find((r) => r.session.id === id)?.chatEpoch !== epoch) return
            const message = await useService((service) => {
              const current = records().find((r) => r.session.id === id)
              if (current?.chatEpoch !== epoch) throw new Error('对话已清空')
              return service.addMessage(id, 'assistant', text, articleId)
            }, true)
            doneListeners.forEach((cb) => cb({ requestId, message }))
          })
          .catch((error) =>
            errorListeners.forEach((cb) =>
              cb({ requestId, error: error instanceof Error ? error.message : String(error) })
            )
          )
      }, 0)
      return { requestId, userMessage }
    }
  }
  async function journalWork<T>(
    fn: (service: ReturnType<typeof createJournalService>) => T,
    write = false
  ): Promise<T> {
    const run = async () => {
      const prior = stored('desktop:journal')?.payload
      let value: JournalState = structuredClone(
        prior?.type === 'journal' ? prior.value : { folders: [], notes: [] }
      )
      const changedAssets = new Map<string, Uint8Array | null>()
      const localAssets = {
        put: (id: string, data: Uint8Array) => {
          changedAssets.set(id, data)
        },
        get: (id: string) => {
          const changed = changedAssets.get(id)
          if (changed) return changed
          const prior = stored(assetEntityId(id))?.payload
          const data = prior?.type === 'settings' ? prior.value.data : undefined
          if (typeof data !== 'string' || !data) throw Error('附件尚未同步，请连接电脑后再次同步')
          return decodeAsset(data)
        },
        remove: (id: string) => {
          changedAssets.set(id, null)
        }
      }
      const service = createJournalService(
        {
          read: () => structuredClone(value),
          write: (next) => {
            value = next
          },
          transaction: (work) => work()
        },
        localAssets,
        () => false
      )
      const result = fn(service)
      if (write) {
        const payloads: [string, DesktopPayload][] = [
          ['desktop:journal', { type: 'journal', value }]
        ]
        for (const [id, bytes] of changedAssets)
          payloads.push([
            assetEntityId(id),
            {
              type: 'settings',
              value: {
                data: bytes ? encodeAsset(bytes) : '',
                sha256: bytes ? assetHash(bytes) : ''
              }
            }
          ])
        await store.batch(
          payloads.map(([id, payload]) => {
            const old = stored(id)
            return {
              entity: {
                ...newMeta(),
                id,
                kind: 'desktop' as const,
                version: (old?.version ?? 0) + 1,
                payload
              },
              expectedVersion: old?.version ?? 0,
              operationId: crypto.randomUUID()
            }
          })
        )
        await load()
      }
      return structuredClone(result)
    }
    return write ? exclusive(run) : run()
  }
  const journal = {
    list: () => journalWork((s) => s.read()),
    apply: (command: Parameters<MaoxuanApi['journal']['apply']>[0]) => {
      journalCommandSchema(command, 'command')
      return journalWork((s) => s.apply(command), true)
    },
    attach: (id: string, name: string, mime: string, bytes: Uint8Array) =>
      journalWork((s) => s.attach(id, name, mime, new Uint8Array(bytes)), true),
    media: (id: string) => journalWork((s) => s.media(id)),
    import: async (target: string | null) => {
      const files = await documents.choose()
      if (!files.length) return { cancelled: true, count: 0, message: '已取消' }
      const input: JournalState = { folders: [], notes: [] }
      for (const file of files) {
        if (file.size > 2_000_000) throw new Error('单个 Markdown 文件不能超过 2 MB')
        const now = new Date().toISOString()
        input.notes.push({
          id: crypto.randomUUID(),
          folderId: null,
          title: file.name.replace(/\.(md|markdown)$/i, ''),
          markdown: await file.text(),
          tags: [],
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          deleted: false,
          source: 'import',
          revision: 0,
          attachments: []
        })
      }
      const count = await journalWork((s) => s.importRecords(input, {}, target), true)
      return { cancelled: false, count, message: `已导入 ${count} 篇 Markdown` }
    },
    export: async (folderId: string | null, noteId?: string) => {
      const state = await journal.list()
      const notes = state.notes.filter(
        (n) => !n.deleted && (noteId ? n.id === noteId : !folderId || n.folderId === folderId)
      )
      if (!notes.length) throw new Error('没有可导出的记录')
      await documents.export(notes)
      return {
        cancelled: false,
        count: notes.length,
        message: `已导出 ${notes.length} 篇 Markdown`
      }
    }
  }
  // Preserve v0.1 records as real desktop Markdown notes / sessions. Old entities
  // remain in backups; a stable migration marker prevents duplicate conversion.
  if (!config().legacyMigrated) {
    for (const legacy of entities.filter((e) => e.kind === 'note'))
      await journalWork((service) => {
        const safeFolder = legacy.folder
          .replace(/[\\/\u0000-\u001f]/g, '_')
          .trim()
          .slice(0, 100)
        const folderId = safeFolder ? 'legacy-folder:' + hash(safeFolder) : null
        service.importRecords(
          {
            folders: folderId
              ? [
                  {
                    id: folderId,
                    parentId: null,
                    name: safeFolder,
                    archived: false,
                    deleted: false
                  }
                ]
              : [],
            notes: [
              {
                id: 'legacy-note:' + legacy.id,
                folderId,
                title: legacy.title,
                markdown:
                  (legacy.source ? `> ${legacy.source.quote.replaceAll('\n', '\n> ')}\n\n` : '') +
                  legacy.body,
                tags: [],
                createdAt: legacy.updatedAt,
                updatedAt: legacy.updatedAt,
                completedAt: null,
                deleted: false,
                source: 'import',
                revision: 0,
                attachments: []
              }
            ]
          },
          {},
          null
        )
      }, true)
    for (const legacy of entities.filter((e) => e.kind === 'reading')) {
      const stableId = 'legacy-reading:' + legacy.id
      if (stored('desktop:session:' + stableId)) continue
      await useService(
        (service) => {
          const created = service.createSession(legacy.question.slice(0, 24), 'reading')
          return service.mutateSession(
            created.id,
            created.stateVersion,
            crypto.randomUUID(),
            { legacy: legacy.id },
            (current) => {
              const data = structuredClone(current.data)
              data.problem.text = legacy.question
              data.diagnosis = {
                restated: legacy.question,
                symptoms: [],
                mainContradiction: '',
                stage: '',
                recommendations: []
              }
              const a = legacy.source ? getChapter(legacy.source.articleId) : null
              if (a) {
                const index = a.paragraphs.indexOf(legacy.source!.quote)
                data.readings.push({
                  articleId: a.id,
                  title: a.title,
                  startedAt: legacy.updatedAt,
                  focusQuestion: legacy.question,
                  passages: [],
                  reflections:
                    index >= 0
                      ? [
                          {
                            id: crypto.randomUUID(),
                            paragraphIndex: index,
                            quote: legacy.source!.quote,
                            text: '',
                            createdAt: legacy.updatedAt
                          }
                        ]
                      : [],
                  readDone: false,
                  notes: { coreMethod: '', relatedProblem: legacy.relation, action: '' },
                  feedback: null,
                  notesDone: false
                })
              }
              if (legacy.review)
                data.reviews.push({
                  id: crypto.randomUUID(),
                  createdAt: legacy.updatedAt,
                  newSituation: legacy.review,
                  rereadArticleIds: [],
                  advice: ''
                })
              return {
                data,
                currentStep: legacy.question.trim().length >= 10 && a ? 'focus' : 'problem'
              }
            },
            '迁移早期阅读记录'
          )
        },
        true,
        stableId
      )
    }
    await exclusive(() =>
      persist('desktop:settings', {
        type: 'settings',
        value: { ...config(), legacyMigrated: true }
      })
    )
  }
  const actionList = () =>
    entities
      .filter((e): e is Stored => e.kind === 'desktop' && e.payload.type === 'action')
      .map((e) => (e.payload as { type: 'action'; value: ActionItem }).value)
  const actions = {
    list: async () => {
      await load()
      return actionList()
    },
    create: async (edit: ActionEdit) =>
      exclusive(async () => {
        actionEditSchema(edit, 'action')
        if (!edit.text?.trim()) throw new Error('请填写任务名称')
        const a: ActionItem = {
          id: crypto.randomUUID(),
          text: edit.text.trim(),
          status: 'todo',
          quadrant: edit.quadrant ?? null,
          dueDate: edit.dueDate ?? '',
          purpose: edit.purpose ?? '',
          verify: edit.verify ?? '',
          fromArticleId: null,
          result: '',
          progress: [],
          createdAt: new Date().toISOString()
        }
        schemas.actionSchema(a, 'action')
        await persist(`desktop:action:${a.id}`, { type: 'action', value: a })
        return a
      }),
    edit: async (id: string, edit: ActionEdit, progress?: string) =>
      exclusive(async () => {
        actionEditSchema(edit, 'action')
        const current = actionList().find((a) => a.id === id)
        if (!current) throw new Error('行动已被删除，请刷新列表')
        if (edit.text !== undefined && !edit.text.trim()) throw new Error('任务名称不能为空')
        const next = {
          ...current,
          ...edit,
          text: edit.text === undefined ? current.text : edit.text.trim(),
          progress: progress?.trim()
            ? [
                ...current.progress,
                {
                  id: crypto.randomUUID(),
                  text: progress.trim(),
                  createdAt: new Date().toISOString()
                }
              ]
            : current.progress
        }
        schemas.actionSchema(next, 'action')
        await persist(`desktop:action:${id}`, { type: 'action', value: next })
        return next
      })
  }
  const classifier = createActionClassifier({
    randomUUID: () => crypto.randomUUID(),
    getSession: api.sessions.get,
    getSettings: () => actualSettings(),
    listActions: actions.list,
    editAction: actions.edit,
    callJson: runtime.json('action_classification'),
    withModelContext: (_ctx, fn) => fn(),
    applyCommands: api.reading.apply,
    applyWorkbench: api.wb.apply
  })
  const unsupported = async () => {
    throw new Error('此平台能力尚未接入移动端')
  }
  // Unsupported platform capabilities fail explicitly rather than returning fake data.
  const complete = new Proxy(
    {
      ...api,
      sync: {
        status: async () => ({ running: false, pairing: [] }),
        start: async () => {
          throw Error('请在电脑端开启同步')
        },
        stop: async () => ({ running: false, pairing: [] }),
        exchange: (pairing: string) =>
          exclusive(async () => {
            const result = await synchronize(store, pairing)
            await load()
            return result
          })
      },
      march: {
        get: () =>
          exclusive(async () => {
            const prior = stored('desktop:march')?.payload
            const state = mobileMarch(prior?.type === 'march' ? prior.value : undefined, entities)
            if (
              !prior ||
              prior.type !== 'march' ||
              JSON.stringify(prior.value) !== JSON.stringify(state.state)
            )
              await persist('desktop:march', { type: 'march', value: state.state })
            return state.service.getProgress()
          }),
        plant: (nodeId: string, requestId: string) =>
          exclusive(async () => {
            const prior = stored('desktop:march')?.payload
            const state = mobileMarch(prior?.type === 'march' ? prior.value : undefined, entities)
            const result = state.service.plant(nodeId, requestId)
            await persist('desktop:march', { type: 'march', value: state.state })
            return result
          }),
        collect: (nodeId: string) =>
          exclusive(async () => {
            const prior = stored('desktop:march')?.payload
            const state = mobileMarch(prior?.type === 'march' ? prior.value : undefined, entities)
            const result = state.service.collect(nodeId)
            await persist('desktop:march', { type: 'march', value: state.state })
            return result
          })
      },
      chat,
      journal,
      actions: { ...actions, classify: classifier.classifyActions },
      speech: { synthesize: unsupported, prefetch: unsupported, cancel: async () => {} },
      tasks: { list: async () => [], onChanged: () => () => {} }
    },
    {
      get(target, group) {
        return Reflect.get(target, group)
      }
    }
  )
  return {
    api: complete as unknown as MaoxuanApi,
    refresh: load,
    readSessions: () => api.sessions.list()
  }
}
