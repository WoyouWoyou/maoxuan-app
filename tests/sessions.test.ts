import { createReadingContext as createSuggestionContext } from '../src/main/modules/reading/context'
import { createWorkbenchContext } from '../src/main/modules/workbench/context'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/adapters/sqlite/database'
import { createSessionRepository } from '../src/main/adapters/sqlite/session-repository'
import { createLibraryRepository } from '../src/main/adapters/sqlite/library-repository'
import { configureLibrary, requireBook } from '../src/main/modules/library/public'
import {
  configureSessions,
  createSessionService,
  createSession,
  getSession,
  updateSession,
  listVersions,
  restoreVersion,
  decodeSessionData,
  archiveSession,
  addMessage,
  listSessions
} from '../src/main/modules/sessions/public'
import { applyCommands, validateReadingSession } from '../src/main/modules/reading/public'
import { applyWorkbench, validateWorkbenchSession } from '../src/main/modules/workbench/public'
import {
  emptySessionData,
  emptyWorkbench,
  type Reading,
  type Session,
  type SessionData,
  type Diagnosis,
  type WbAction
} from '../src/shared/types'
import { readingCommands } from '../src/shared/contracts/reading'
let db: Database.Database, session: Session
const diagnostic = (): Diagnosis => ({
  restated: '建议',
  symptoms: [],
  mainContradiction: '障碍',
  stage: '阶段',
  recommendations: []
})
const reading = (): Reading => ({
  articleId: 'c',
  title: '章节',
  startedAt: 'now',
  focusQuestion: '问题',
  passages: [],
  reflections: [],
  readDone: true,
  notes: { coreMethod: '方法', relatedProblem: '处境', action: '尝试' },
  feedback: null,
  notesDone: false
})
function wbAction(id: string, overrides: Partial<Omit<WbAction, 'id'>> = {}): WbAction {
  return {
    id,
    horizon: '7d',
    action: `动作 ${id}`,
    purpose: `目的 ${id}`,
    verify: `验证 ${id}`,
    standards: ['实事求是'],
    kpi: `指标 ${id}`,
    planningState: 'candidate',
    status: 'todo',
    progress: [],
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides
  }
}
/** 旧版行动没有 planningState；2 → 3 迁移应补成 queued。 */
function legacyAction(id: string): Record<string, unknown> {
  const value: Record<string, unknown> = {
    ...wbAction(id, {
      status: 'done',
      progress: [{ id: 'p1', text: '已完成', createdAt: '2026-10-23' }]
    })
  }
  delete value.planningState
  return value
}
function legacyWorkbenchData(version: number): SessionData {
  return {
    ...emptySessionData(),
    schemaVersion: version,
    workbench: { ...emptyWorkbench('项目目标'), actions: [legacyAction('a1')] }
  } as unknown as SessionData
}
beforeEach(() => {
  db = openDatabase(':memory:')
  const library = createLibraryRepository(db)
  configureLibrary(library)
  library.syncBuiltin([
    { id: 'c', title: '章节', volume: '正文', content: '第一段真实原文。\n第二段真实原文。' }
  ])
  configureSessions(createSessionRepository(db), {
    requireBook,
    validate: (s, d, restoring, step) =>
      s.mode === 'reading'
        ? validateReadingSession(s, d, restoring, step)
        : validateWorkbenchSession(s, d, restoring, step)
  })
  session = createSession('要解决的问题')
})
afterEach(() => db.close())
describe('one atomic session boundary', () => {
  it('rejects competing stale writers in both modes and increments lifecycle versions', () => {
    const first = applyCommands(
      session.id,
      [{ kind: 'problem', value: { text: '第一位编辑', background: '', tried: '' } }],
      0,
      '修改',
      undefined,
      'one'
    )
    expect(() =>
      applyCommands(
        session.id,
        [{ kind: 'problem', value: { text: '覆盖', background: '', tried: '' } }],
        0,
        undefined,
        undefined,
        'two'
      )
    ).toThrow('其他窗口')
    expect(getSession(session.id)?.data.problem.text).toBe('第一位编辑')
    archiveSession(session.id)
    expect(getSession(session.id)?.stateVersion).toBe(first.stateVersion! + 1)
    const wb = createSession('项目', 'workbench'),
      form = { ...wb.data.workbench!.form, objective: '新目标' }
    applyWorkbench(wb.id, [{ kind: 'form', value: form }], 0, undefined, undefined, 'wb1')
    expect(() =>
      applyWorkbench(wb.id, [{ kind: 'form', value: form }], 0, undefined, undefined, 'wb2')
    ).toThrow('其他窗口')
  })
  it('deduplicates retries before version checking and rejects mutation ID reuse', () => {
    const commands = [{ kind: 'diagnosis' as const, value: diagnostic() }]
    const first = applyCommands(session.id, commands, 0, '诊断', undefined, 'same')
    const retry = applyCommands(session.id, commands, 0, '诊断', undefined, 'same')
    expect(retry.stateVersion).toBe(first.stateVersion)
    expect(listVersions(session.id)).toHaveLength(2)
    applyCommands(session.id, commands, 1, '诊断', undefined, 'another-request')
    expect(listVersions(session.id)).toHaveLength(2)
    expect(() => applyCommands(session.id, [], 0, '诊断', undefined, 'same')).toThrow('不同的内容')
  })
  it('rolls back content, snapshot and receipt when snapshot insertion fails', () => {
    db.exec(
      "CREATE TRIGGER fail_snapshot BEFORE INSERT ON versions BEGIN SELECT RAISE(ABORT,'snapshot failed'); END"
    )
    const commands = [{ kind: 'diagnosis' as const, value: diagnostic() }]
    expect(() => applyCommands(session.id, commands, 0, '快照', undefined, 'retry')).toThrow(
      'snapshot failed'
    )
    expect(getSession(session.id)?.stateVersion).toBe(0)
    expect(db.prepare('SELECT * FROM session_mutations').all()).toHaveLength(0)
    db.exec('DROP TRIGGER fail_snapshot')
    expect(applyCommands(session.id, commands, 0, '快照', undefined, 'retry').stateVersion).toBe(1)
  })
  it('closes whole-document writes and validates mode, schema and sources', () => {
    expect(() =>
      updateSession(session.id, { data: session.data, expectedStateVersion: 0, mutationId: 'bad' })
    ).toThrow('格式')
    expect(() =>
      applyCommands(session.id, [], undefined as any, undefined, undefined, 'x')
    ).toThrow('版本')
    expect(() =>
      applyCommands(
        session.id,
        [{ kind: 'startReading', value: { ...reading(), articleId: 'missing' } }],
        0,
        undefined,
        undefined,
        'bad'
      )
    ).toThrow('章节')
    expect(() =>
      applyCommands(
        session.id,
        [{ kind: 'diagnosis', value: { ...diagnostic(), restated: 5 } as any }],
        0,
        undefined,
        undefined,
        'bad'
      )
    ).toThrow('格式')
    expect(() =>
      applyCommands(
        session.id,
        [
          {
            kind: 'startReading',
            value: {
              ...reading(),
              passages: [{ paragraphIndex: 0, quote: '编造', why: '', verified: true }]
            }
          }
        ],
        0,
        undefined,
        undefined,
        'bad'
      )
    ).toThrow('原文')
    expect(getSession(session.id)?.stateVersion).toBe(0)
    expect(() => applyWorkbench(session.id, [], 0, undefined, undefined, 'wrong')).toThrow('工作台')
  })
  it('updates notes and reflections with intents without dropping other fields', () => {
    session = applyCommands(
      session.id,
      [{ kind: 'startReading', value: reading() }],
      0,
      undefined,
      undefined,
      'start'
    )
    const next = structuredClone(session.data)
    next.readings[0].notes.action = '新行动'
    next.readings[0].reflections.push({
      id: 'f',
      paragraphIndex: 1,
      quote: '第二段',
      text: '感受',
      createdAt: 'now'
    })
    const commands = readingCommands(session.data, next)
    expect(commands.map((c) => c.kind)).toEqual(['saveNotes', 'reflection'])
    session = applyCommands(session.id, commands, 1, undefined, undefined, 'notes')
    expect(session.data.readings[0].readDone).toBe(true)
    expect(session.data.readings[0].reflections[0].source?.paragraphId).toBe('c:p1')
  })
})
describe('versioned data and history', () => {
  it('migrates legacy snapshots on restoration and protects against stale restores', () => {
    const version = listVersions(session.id)[0]
    const legacy = emptySessionData()
    delete legacy.schemaVersion
    legacy.problem.text = '旧版问题'
    db.prepare('UPDATE versions SET data=? WHERE id=?').run(JSON.stringify(legacy), version.id)
    const restored = restoreVersion(version.id, 0, 'restore')
    expect(restored.data.schemaVersion).toBe(3)
    expect(restored.data.book?.revisionId).toBe('maoxuan-v1')
    expect(restored.data.problem.text).toBe('旧版问题')
    expect(restoreVersion(version.id, 0, 'restore').stateVersion).toBe(1)
    expect(() => restoreVersion(version.id, 0, 'other')).toThrow('其他窗口')
    expect(listVersions(session.id)).toHaveLength(2)
  })
  it('migrates v0, v1 and v2 workbench actions continuously to queued', () => {
    for (const version of [2, 1, 0] as const) {
      const legacy = legacyWorkbenchData(version)
      const decoded = decodeSessionData(legacy)
      expect(decoded.schemaVersion).toBe(3)
      expect(decoded.workbench!.actions[0]).toMatchObject({
        id: 'a1',
        planningState: 'queued',
        status: 'done',
        progress: [{ id: 'p1' }]
      })
      // 解码克隆输入，不把迁移字段写回调用方的旧文档。
      expect(legacy.workbench!.actions[0]).not.toHaveProperty('planningState')
    }
    expect(decodeSessionData({ ...emptySessionData(), schemaVersion: 0 }).schemaVersion).toBe(3)
  })
  it('rejects v3 workbench actions with missing or illegal planning state', () => {
    expect(() => decodeSessionData(legacyWorkbenchData(3))).toThrow('格式')
    const illegal = legacyWorkbenchData(3)
    ;(illegal.workbench!.actions[0] as unknown as Record<string, unknown>).planningState = 'other'
    expect(() => decodeSessionData(illegal)).toThrow('格式')
  })
  it('restores the planning state stored in new snapshots in both directions', () => {
    let wb = createSession('项目目标需要具体', 'workbench')
    wb = applyWorkbench(
      wb.id,
      [
        {
          kind: 'createQueuedAction',
          value: {
            id: 'a1',
            horizon: '7d',
            action: '联系客户',
            purpose: '',
            verify: '',
            standards: [],
            kpi: ''
          }
        }
      ],
      0,
      '加入待办',
      undefined,
      'add'
    )
    expect(wb.data.workbench!.actions[0].planningState).toBe('queued')
    const queuedSnapshot = listVersions(wb.id)[0]

    wb = applyWorkbench(
      wb.id,
      [{ kind: 'returnActionsToCandidates', ids: ['a1'] }],
      1,
      '移回候选',
      undefined,
      'return'
    )
    expect(wb.data.workbench!.actions[0].planningState).toBe('candidate')
    const candidateSnapshot = listVersions(wb.id)[0]

    const queued = restoreVersion(queuedSnapshot.id, 2, 'restore-queued')
    expect(queued.data.workbench!.actions[0].planningState).toBe('queued')
    const candidate = restoreVersion(candidateSnapshot.id, 3, 'restore-candidate')
    expect(candidate.data.workbench!.actions[0].planningState).toBe('candidate')
  })
  it('migrates an old snapshot to queued when restoring it', () => {
    const wb = createSession('项目目标需要具体', 'workbench')
    const version = listVersions(wb.id)[0]
    const legacy = {
      ...structuredClone(wb.data),
      schemaVersion: 2,
      workbench: { ...structuredClone(wb.data.workbench!), actions: [legacyAction('a1')] }
    }
    db.prepare('UPDATE versions SET data=? WHERE id=?').run(JSON.stringify(legacy), version.id)
    const restored = restoreVersion(version.id, 0, 'restore-old')
    expect(restored.data.schemaVersion).toBe(3)
    expect(restored.data.workbench!.actions[0]).toMatchObject({
      planningState: 'queued',
      status: 'done'
    })
  })
  it('rejects future versions without silently rewriting and migrates generic semantics', () => {
    expect(() => decodeSessionData({ ...emptySessionData(), schemaVersion: 999 })).toThrow('升级')
    const old = {
      ...session.data,
      schemaVersion: 1,
      book: { ...session.data.book!, profile: 'generic' as const },
      diagnosis: diagnostic()
    }
    expect(decodeSessionData(old).diagnosis?.analysis).toEqual({
      obstacle: '障碍',
      constraints: '阶段'
    })
    expect(old.diagnosis.analysis).toBeUndefined()
  })
  it('lists summaries without decoding full documents', () => {
    db.prepare('UPDATE sessions SET data=? WHERE id=?').run('broken json', session.id)
    expect(listSessions()[0].bookTitle).toBe('毛泽东选集')
  })
})

describe('workbench action selection persistence', () => {
  it('deduplicates enqueue retries and rejects stale expected versions', () => {
    let wb = createSession('项目目标需要具体', 'workbench')
    wb = applyWorkbench(
      wb.id,
      [
        { kind: 'action', value: wbAction('c1') },
        { kind: 'action', value: wbAction('c2') }
      ],
      0,
      '整理候选',
      undefined,
      'seed'
    )
    const commands = [{ kind: 'enqueueActions' as const, ids: ['c1', 'c2'] }]
    const first = applyWorkbench(wb.id, commands, 1, '加入待办', undefined, 'enqueue')
    expect(first.stateVersion).toBe(2)
    expect(first.data.workbench!.actions.map((a) => a.planningState)).toEqual(['queued', 'queued'])

    const versions = listVersions(wb.id).length
    const retry = applyWorkbench(wb.id, commands, 1, '加入待办', undefined, 'enqueue')
    expect(retry.stateVersion).toBe(first.stateVersion)
    expect(retry.versionNo).toBe(first.versionNo)
    expect(retry.data.workbench!.actions).toEqual(first.data.workbench!.actions)
    expect(listVersions(wb.id)).toHaveLength(versions)

    expect(() =>
      applyWorkbench(
        wb.id,
        [{ kind: 'enqueueActions', ids: ['c1'] }],
        1,
        '加入待办',
        undefined,
        'stale'
      )
    ).toThrow('其他窗口')
  })
  it('leaves state, versions and actions untouched when an enqueue batch names a missing action', () => {
    let wb = createSession('项目目标需要具体', 'workbench')
    wb = applyWorkbench(
      wb.id,
      [{ kind: 'action', value: wbAction('c1') }],
      0,
      '整理候选',
      undefined,
      'seed'
    )
    const before = getSession(wb.id)!
    const versions = listVersions(wb.id).length

    expect(() =>
      applyWorkbench(
        wb.id,
        [{ kind: 'enqueueActions', ids: ['c1', 'missing'] }],
        1,
        '加入待办',
        undefined,
        'atomic'
      )
    ).toThrow('有行动已被删除，请刷新后重新选择')

    const after = getSession(wb.id)!
    expect(after.stateVersion).toBe(before.stateVersion)
    expect(after.versionNo).toBe(before.versionNo)
    expect(after.data.workbench!.actions).toEqual(before.data.workbench!.actions)
    expect(after.data.workbench!.actions[0].planningState).toBe('candidate')
    expect(listVersions(wb.id)).toHaveLength(versions)
  })
})

describe('AI result applicability at confirmation', () => {
  it('rejects notes feedback after notes change, including a combined stale write', () => {
    session = applyCommands(
      session.id,
      [{ kind: 'startReading', value: reading() }],
      0,
      undefined,
      undefined,
      'start'
    )
    const feedback = {
      passed: true,
      scores: { coreMethod: 4, relatedProblem: 4, action: 4 },
      comments: [],
      rereadParagraphs: [],
      _context: createSuggestionContext(session, 'reviewNotes', 'c')
    }
    const commands = [
      { kind: 'saveNotes' as const, id: 'c', value: { ...reading().notes, action: '改过了' } },
      { kind: 'feedback' as const, id: 'c', value: feedback }
    ]
    expect(() => applyCommands(session.id, commands, 1, undefined, undefined, 'late')).toThrow(
      '过时'
    )
    expect(getSession(session.id)?.data.readings[0].notes.action).toBe('尝试')
  })
  it('allows unrelated action edits during diagnosis but rejects problem changes', () => {
    const diagnosis = { ...diagnostic(), _context: createSuggestionContext(session, 'diagnose') }
    session = applyCommands(
      session.id,
      [{ kind: 'startReading', value: reading() }],
      0,
      undefined,
      undefined,
      'read'
    )
    session = applyCommands(
      session.id,
      [{ kind: 'diagnosis', value: diagnosis }],
      1,
      undefined,
      undefined,
      'apply'
    )
    const fresh = { ...diagnostic(), _context: createSuggestionContext(session, 'diagnose') }
    session = applyCommands(
      session.id,
      [{ kind: 'problem', value: { text: '新问题', background: '', tried: '' } }],
      2,
      undefined,
      undefined,
      'problem'
    )
    expect(() =>
      applyCommands(
        session.id,
        [{ kind: 'diagnosis', value: fresh }],
        3,
        undefined,
        undefined,
        'late'
      )
    ).toThrow('过时')
  })
  it('rejects cross-session results and stale workbench conclusions', () => {
    const other = createSession('另一个问题'),
      diagnosis = { ...diagnostic(), _context: createSuggestionContext(session, 'diagnose') }
    expect(() =>
      applyCommands(
        other.id,
        [{ kind: 'diagnosis', value: diagnosis }],
        0,
        undefined,
        undefined,
        'cross'
      )
    ).toThrow('不属于')
    let wb = createSession('项目', 'workbench')
    const intake = {
      facts: [],
      missing: [],
      questions: [],
      mainline: '目标',
      sideGoals: [],
      generatedAt: 'now',
      _context: createWorkbenchContext(wb, 'wb_intake')
    }
    wb = applyWorkbench(
      wb.id,
      [{ kind: 'form', value: { ...wb.data.workbench!.form, objective: '不同目标' } }],
      0,
      undefined,
      undefined,
      'form'
    )
    expect(() =>
      applyWorkbench(wb.id, [{ kind: 'intake', value: intake }], 1, undefined, undefined, 'late')
    ).toThrow('过时')
  })
  it('preserves accepted provenance when manually editing a revised diagnosis', () => {
    const diagnosis = {
      ...diagnostic(),
      _context: createSuggestionContext(session, 'reviseProblem')
    }
    session = applyCommands(
      session.id,
      [
        { kind: 'problem', value: { text: '修订的问题', background: '', tried: '' } },
        { kind: 'diagnosis', value: diagnosis }
      ],
      0,
      undefined,
      undefined,
      'revision'
    )
    expect(() =>
      applyCommands(
        session.id,
        [{ kind: 'diagnosis', value: { ...diagnosis, restated: '手动调整' } }],
        1,
        undefined,
        undefined,
        'edit'
      )
    ).not.toThrow()
  })
})

describe('independent application instances', () => {
  it('isolates repositories without Electron or global database replacement', () => {
    const second = openDatabase(':memory:'),
      library = createLibraryRepository(second)
    try {
      library.syncBuiltin([{ id: 'c', title: '另一个库', volume: '', content: '原文' }])
      const service = createSessionService(createSessionRepository(second), {
        requireBook: library.requireBook,
        validate: () => {}
      })
      const created = service.createSession('另一个实例')
      expect(getSession(created.id)).toBeNull()
      expect(service.getSession(session.id)).toBeNull()
      expect(service.listSessions()).toHaveLength(1)
    } finally {
      second.close()
    }
  })
  it('does not invalidate independent parallel workbench analyses', () => {
    let wb = createSession('项目', 'workbench')
    const context = createWorkbenchContext(wb, 'wb_contradiction')
    const routesContext = createWorkbenchContext(wb, 'wb_routes')
    const base = { factRefs: [], missingFacts: [], generatedAt: 'now', edited: false }
    wb = applyWorkbench(
      wb.id,
      [
        {
          kind: 'diagnosisModule',
          module: 'contradiction',
          value: {
            ...base,
            all: [],
            primary: '主矛盾',
            mainAspect: '',
            secondaryAspect: '',
            why: '',
            turningConditions: [],
            focus: '',
            defer: [],
            _context: context
          }
        }
      ],
      0,
      undefined,
      undefined,
      'contradiction'
    )
    expect(() =>
      applyWorkbench(
        wb.id,
        [
          {
            kind: 'diagnosisModule',
            module: 'routes',
            value: { ...base, routes: [], _context: routesContext }
          }
        ],
        1,
        undefined,
        undefined,
        'routes'
      )
    ).not.toThrow()
  })
})

describe('authoritative workflow guards', () => {
  it('rejects step skipping through both metadata and domain commands', () => {
    expect(() =>
      updateSession(session.id, {
        expectedStateVersion: 0,
        mutationId: 'skip',
        currentStep: 'apply'
      })
    ).toThrow('笔记')
    const wb = createSession('项目目标需要具体', 'workbench')
    expect(() => applyWorkbench(wb.id, [], 0, undefined, 'wb_act', 'skip')).toThrow('确认综合决策')
    expect(getSession(wb.id)?.stateVersion).toBe(0)
  })
  it('rejects a problem revision based on a conversation that changed before confirmation', () => {
    addMessage(session.id, 'user', '旧讨论')
    const diagnosis = {
      ...diagnostic(),
      _context: createSuggestionContext(session, 'reviseProblem')
    }
    addMessage(session.id, 'user', '补充了新的约束')
    expect(() =>
      applyCommands(
        session.id,
        [{ kind: 'diagnosis', value: diagnosis }],
        0,
        undefined,
        undefined,
        'old-chat'
      )
    ).toThrow('讨论已变化')
  })
})

describe('version 2 database upgrade', () => {
  it('backfills summaries and incrementally maintains the old full-text index', async () => {
    const { migrate, DATABASE_VERSION } = await import('../src/main/adapters/sqlite/migrations')
    db.exec(`DROP INDEX sessions_summary;
      DROP TABLE session_mutations;
      ALTER TABLE sessions DROP COLUMN book_id;
      ALTER TABLE sessions DROP COLUMN book_title;
      DROP TRIGGER articles_fts_insert;
      DROP TRIGGER articles_fts_update;
      DROP TRIGGER articles_fts_delete;
      PRAGMA user_version=2;`)
    migrate(db)
    expect(listSessions()[0].bookTitle).toBe('毛泽东选集')
    db.prepare('UPDATE articles SET title=? WHERE id=?').run('更新后的标题', 'c')
    expect(
      db.prepare('SELECT title FROM articles_fts WHERE articles_fts MATCH ?').all('"更新后的标题"')
    ).toHaveLength(1)
    migrate(db)
    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_VERSION)
  })
})

describe('workbench-owned intake ledger', () => {
  it('records confirmed intake and raw user input atomically without a renderer-authored ledger', () => {
    const wb = createSession('原始项目目标', 'workbench')
    const intake = {
      facts: [],
      missing: [],
      questions: [],
      mainline: '目标',
      sideGoals: [],
      generatedAt: 'now',
      _context: createWorkbenchContext(wb, 'wb_intake')
    }
    const result = applyWorkbench(
      wb.id,
      [{ kind: 'intake', value: intake }],
      0,
      '整理事实',
      undefined,
      'intake'
    )
    expect(result.data.workbench?.ledger).toHaveLength(1)
    expect(result.data.workbench?.ledger[0].inputType).toBe('new')
    expect(result.data.workbench?.ledger[0].rawInput).toContain('原始项目目标')
    const retry = applyWorkbench(
      wb.id,
      [{ kind: 'intake', value: intake }],
      1,
      '整理事实',
      undefined,
      'repeat'
    )
    expect(retry.data.workbench?.ledger).toHaveLength(1)
    expect(retry.versionNo).toBe(result.versionNo)
  })
})
