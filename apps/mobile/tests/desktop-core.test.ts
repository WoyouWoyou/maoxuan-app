import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { createBrowserStore } from '../src/adapters/indexeddb'
import { createDesktopApi } from '../src/application/desktop-api'
import { collectActions } from '@shared/actions'
import { emptyWorkbench } from '@shared/types'
import { assertSessionData } from '@shared/contracts/state-schema'
const setup = async () => {
  const store = await createBrowserStore(crypto.randomUUID())
  const builtins = [
    {
      id: 'p',
      title: '实践论',
      volume: '第一卷',
      content: '*\n认识来自实践。\n回到实践中去。',
      revisionId: 'hash',
      isCore: true,
      coreOrder: 1
    }
  ]
  const { api } = await createDesktopApi(store, builtins)
  return { store, api, builtins }
}
describe('same desktop domain on mobile storage', () => {
  it('saves notes with passage, reflection and recommendation sources and reopens them', async () => {
    const { store, api } = await setup()
    let s = await api.sessions.create('我应该如何减少团队的重复沟通')
    s = await api.reading.apply(
      s.id,
      [
        {
          kind: 'diagnosis',
          value: {
            restated: s.data.problem.text,
            symptoms: [],
            mainContradiction: '信息没有统一记录',
            stage: '调查阶段',
            recommendations: [
              {
                articleId: 'p',
                title: '实践论',
                reason: '先调查',
                focusQuestion: '怎样调查',
                evidence: {
                  paragraphIndex: 1,
                  quote: '认识来自实践。',
                  source: {
                    bookId: 'maoxuan',
                    revisionId: 'maoxuan-v1',
                    chapterId: 'p',
                    paragraphId: 'p:p1'
                  }
                }
              }
            ]
          }
        },
        {
          kind: 'startReading',
          value: {
            articleId: 'p',
            title: '实践论',
            startedAt: new Date().toISOString(),
            focusQuestion: '怎样调查',
            passages: [
              { paragraphIndex: 1, quote: '认识来自实践。', why: '先调查', verified: true }
            ],
            reflections: [
              {
                id: 'reflection',
                paragraphIndex: 2,
                quote: '回到实践中去。',
                text: '先访谈',
                createdAt: new Date().toISOString()
              }
            ],
            readDone: true,
            notes: { coreMethod: '', relatedProblem: '', action: '' },
            feedback: null,
            notesDone: false
          }
        }
      ],
      s.stateVersion,
      '完成阅读',
      'relate'
    )
    expect(() => assertSessionData(s.data)).not.toThrow()
    const notes = {
      coreMethod: '从实际出发',
      relatedProblem: '调查沟通现状',
      action: '访谈三位同事'
    }
    s = await api.reading.apply(
      s.id,
      [
        { kind: 'saveNotes', id: 'p', value: notes },
        {
          kind: 'readingStatus',
          id: 'p',
          focusQuestion: '怎样调查',
          readDone: true,
          notesDone: true
        }
      ],
      s.stateVersion,
      '保存笔记',
      'apply'
    )
    const restarted = await createDesktopApi(store, [])
    const reopened = await restarted.api.sessions.get(s.id)
    expect(reopened?.data.readings[0].notes).toEqual(notes)
    const sources = [
      reopened!.data.readings[0].passages[0].source,
      reopened!.data.readings[0].reflections[0].source,
      reopened!.data.diagnosis!.recommendations[0].evidence!.source
    ]
    for (const source of sources)
      expect(Object.keys(source!).sort()).toEqual([
        'bookId',
        'chapterId',
        'paragraphId',
        'revisionId'
      ])
  })
  it('repairs existing mobile sources in sessions and historical versions before saving notes', async () => {
    const { store, api, builtins } = await setup()
    let s = await api.sessions.create('我应该如何减少团队的重复沟通')
    s = await api.reading.apply(
      s.id,
      [
        {
          kind: 'startReading',
          value: {
            articleId: 'p',
            title: '实践论',
            startedAt: new Date().toISOString(),
            focusQuestion: '怎样调查',
            passages: [
              { paragraphIndex: 1, quote: '认识来自实践。', why: '先调查', verified: true }
            ],
            reflections: [
              {
                id: 'reflection',
                paragraphIndex: 2,
                quote: '回到实践中去。',
                text: '先访谈',
                createdAt: new Date().toISOString()
              }
            ],
            readDone: false,
            notes: { coreMethod: '', relatedProblem: '', action: '' },
            feedback: null,
            notesDone: false
          }
        }
      ],
      s.stateVersion,
      '开始阅读'
    )
    const snapshot = await store.snapshot()
    const entity = snapshot.entities.find((entity) => entity.id === `desktop:session:${s.id}`)!
    if (entity.kind !== 'desktop' || entity.payload.type !== 'session') throw new Error('缺少会话')
    const record = entity.payload.value
    const historical = record.versions.at(-1)!
    for (const data of [record.session.data, historical.data]) {
      for (const reading of data.readings)
        for (const item of [...reading.passages, ...reading.reflections])
          Object.assign(item.source!, data.book)
    }
    expect(() => assertSessionData(record.session.data)).toThrow(
      'session.readings[0].passages[0].source.title'
    )
    await store.restore(snapshot)

    const restarted = await createDesktopApi(store, builtins)
    const reopened = (await restarted.api.sessions.get(s.id))!
    expect(() => assertSessionData(reopened.data)).not.toThrow()
    const notes = {
      coreMethod: '从实际出发',
      relatedProblem: '调查沟通现状',
      action: '访谈三位同事'
    }
    s = await restarted.api.reading.apply(
      s.id,
      [{ kind: 'saveNotes', id: 'p', value: notes }],
      reopened.stateVersion,
      '保存笔记'
    )
    expect(s.data.readings[0].notes).toEqual(notes)
    expect(s.data.readings[0].reflections[0].text).toBe('先访谈')
    const restored = await restarted.api.versions.restore(historical.id, s.stateVersion)
    expect(() => assertSessionData(restored.data)).not.toThrow()
    expect(restored.data.readings[0].passages[0].source).toEqual({
      bookId: 'maoxuan',
      revisionId: 'maoxuan-v1',
      chapterId: 'p',
      paragraphId: 'p:p1'
    })
  })
  it('repairs sources whose extra fields do not match the current book before saving notes', async () => {
    const { store, api, builtins } = await setup()
    let s = await api.sessions.create('我应该如何减少团队的重复沟通')
    s = await api.reading.apply(
      s.id,
      [
        {
          kind: 'startReading',
          value: {
            articleId: 'p',
            title: '实践论',
            startedAt: new Date().toISOString(),
            focusQuestion: '怎样调查',
            passages: [
              { paragraphIndex: 1, quote: '认识来自实践。', why: '先调查', verified: true }
            ],
            reflections: [],
            readDone: false,
            notes: { coreMethod: '', relatedProblem: '', action: '' },
            feedback: null,
            notesDone: false
          }
        }
      ],
      s.stateVersion,
      '开始阅读'
    )
    const snapshot = await store.snapshot()
    const entity = snapshot.entities.find((entity) => entity.id === `desktop:session:${s.id}`)!
    if (entity.kind !== 'desktop' || entity.payload.type !== 'session') throw new Error('缺少会话')
    const record = entity.payload.value
    const historical = record.versions.at(-1)!
    for (const data of [record.session.data, historical.data])
      for (const reading of data.readings)
        for (const item of reading.passages)
          Object.assign(item.source!, {
            title: '与当前书名不同',
            profile: 'generic',
            profileVersion: '9',
            bookId: 'maoxuan',
            revisionId: 'maoxuan-v1'
          })
    await store.restore(snapshot)

    const restarted = await createDesktopApi(store, builtins)
    const reopened = (await restarted.api.sessions.get(s.id))!
    const notes = {
      coreMethod: '从实际出发',
      relatedProblem: '调查沟通现状',
      action: '访谈三位同事'
    }
    s = await restarted.api.reading.apply(
      s.id,
      [{ kind: 'saveNotes', id: 'p', value: notes }],
      reopened.stateVersion,
      '保存笔记'
    )
    expect(s.data.readings[0].notes).toEqual(notes)
    expect(s.data.readings[0].passages[0].source).toEqual({
      bookId: 'maoxuan',
      revisionId: 'maoxuan-v1',
      chapterId: 'p',
      paragraphId: 'p:p1'
    })
  })
  it('enforces reading gates, real source positions, explicit notes, and historical restoration', async () => {
    const { api } = await setup()
    let s = await api.sessions.create('我应该如何减少团队的重复沟通')
    await expect(
      api.sessions.update(s.id, { expectedStateVersion: s.stateVersion, currentStep: 'focus' })
    ).rejects.toThrow('诊断')
    s = await api.reading.apply(
      s.id,
      [
        {
          kind: 'diagnosis',
          value: {
            restated: s.data.problem.text,
            symptoms: [],
            mainContradiction: '信息没有统一记录',
            stage: '调查阶段',
            recommendations: []
          }
        }
      ],
      s.stateVersion,
      '确认问题',
      'focus'
    )
    const article = await api.articles.get('p')
    expect(article?.paragraphIds).toEqual(['p:p0', 'p:p1', 'p:p2'])
    expect(article?.paragraphs[0]).toBe('*')
    const reading = {
      articleId: 'p',
      title: '伪造标题',
      startedAt: new Date().toISOString(),
      focusQuestion: '怎样调查',
      passages: [],
      reflections: [],
      readDone: true,
      notes: {
        coreMethod: '从实际出发',
        relatedProblem: '了解沟通记录缺失情况',
        action: '访谈三位同事'
      },
      feedback: null,
      notesDone: true
    }
    s = await api.reading.apply(
      s.id,
      [{ kind: 'startReading', value: reading }],
      s.stateVersion,
      '完成阅读',
      'apply'
    )
    expect(s.data.readings[0].title).toBe('实践论')
    const version = s.stateVersion
    await expect(
      api.reading.apply(
        s.id,
        [
          {
            kind: 'reflection',
            id: 'p',
            value: {
              id: 'fake',
              paragraphIndex: 1,
              quote: '不存在的原文',
              text: '感想',
              createdAt: new Date().toISOString()
            }
          }
        ],
        version
      )
    ).rejects.toThrow('原文')
    expect((await api.sessions.get(s.id))?.stateVersion).toBe(version)
    const history = await api.versions.list(s.id)
    const restored = await api.versions.restore(history.at(-1)!.id, version)
    expect(restored.data.readings).toHaveLength(0)
    expect(restored.versionNo).toBe(s.versionNo + 1)
  })
  it('keeps the desktop Markdown revision check and content across adapter restarts', async () => {
    const { store, api } = await setup()
    const created = await api.journal.apply({ kind: 'noteCreate', folderId: null })
    const id = created.selectedId!
    const markdown = '# 标题\n\n**粗体**\n\n- [ ] 访谈\n\n> 原文引用\n'
    await api.journal.apply({
      kind: 'noteSave',
      id,
      revision: 0,
      title: '调查笔记',
      markdown,
      tags: ['调查']
    })
    await expect(
      api.journal.apply({
        kind: 'noteSave',
        id,
        revision: 0,
        title: '旧版本',
        markdown: '覆盖',
        tags: []
      })
    ).rejects.toThrow()
    const restarted = await createDesktopApi(store, [])
    expect((await restarted.api.journal.list()).notes[0].markdown).toBe(markdown)
  })
  it('only projects explicitly queued workbench actions into the same four-quadrant hub', async () => {
    const { api } = await setup()
    let s = await api.sessions.create('整理客户需求', 'workbench')
    const wb = emptyWorkbench()
    const a = {
      id: 'a',
      horizon: '7d' as const,
      action: '访谈三位客户',
      purpose: '核对需求',
      verify: '记录三份反馈',
      planningState: 'candidate' as const,
      status: 'todo' as const,
      createdAt: new Date().toISOString(),
      progress: [],
      kpi: '3份反馈',
      standards: [],
      quadrant: null
    }
    // Use the same action schema fixture fields required by desktop workbench.
    const base = { ...a, dueDate: '' }
    try {
      s = await api.wb.apply(s.id, [{ kind: 'action', value: base as any }], s.stateVersion)
    } catch (error) {
      throw error
    }
    expect(collectActions([s])).toHaveLength(0)
    s = await api.wb.apply(s.id, [{ kind: 'enqueueActions', ids: ['a'] }], s.stateVersion)
    expect(collectActions([s])).toHaveLength(1)
    expect(collectActions([s])[0].text).toBe('访谈三位客户')
    const standalone = await api.actions.create({ text: '整理日志', quadrant: 'plan' })
    await api.actions.edit(standalone.id, {}, '已完成第一次整理')
    expect((await api.actions.list())[0].progress).toHaveLength(1)
  })
  it('commits retried desktop commands only once and preserves version conflicts', async () => {
    const { api } = await setup()
    const s = await api.sessions.create('如何验证这次沟通方案是否有效')
    const commands = [
      { kind: 'problem' as const, value: { ...s.data.problem, background: '团队有三个人' } }
    ]
    const a = await api.reading.apply(
      s.id,
      commands,
      s.stateVersion,
      '记录背景',
      undefined,
      'retry'
    )
    const b = await api.reading.apply(
      s.id,
      commands,
      s.stateVersion,
      '记录背景',
      undefined,
      'retry'
    )
    expect(b.stateVersion).toBe(a.stateVersion)
    await expect(api.reading.apply(s.id, commands, s.stateVersion, '其他操作')).rejects.toThrow(
      '其他窗口'
    )
  })
})

it('rejects a delayed desktop AI result after its input changes', async () => {
  const { api } = await setup()
  await api.settings.set({ apiKey: 'test', baseUrl: 'https://mock.example/v1', model: 'mock' })
  const s = await api.sessions.create('如何减少团队中重复的信息沟通')
  let finish!: (response: Response) => void, started!: () => void
  const sent = new Promise<void>((r) => (started = r))
  vi.stubGlobal('fetch', () => {
    started()
    return new Promise<Response>((resolve) => (finish = resolve))
  })
  try {
    const generated = api.ai.diagnose(s.id)
    const rejected = expect(generated).rejects.toThrow('过时')
    await sent
    await api.reading.apply(
      s.id,
      [{ kind: 'problem', value: { ...s.data.problem, text: '如何调查目前客户的真实需求变化' } }],
      s.stateVersion
    )
    finish(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  restated: '旧问题',
                  symptoms: [],
                  mainContradiction: '旧矛盾',
                  stage: '起步',
                  recommendations: []
                })
              }
            }
          ]
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    )
    await rejected
    expect((await api.sessions.get(s.id))?.data.diagnosis).toBe(null)
  } finally {
    vi.unstubAllGlobals()
  }
})
it('migrates early mobile records without losing Markdown or duplicating records on restart', async () => {
  const store = await createBrowserStore(crypto.randomUUID())
  const meta = { version: 1, updatedAt: new Date().toISOString() }
  await store.commit({
    entity: {
      ...meta,
      id: 'old-note',
      kind: 'note',
      title: '原来的记录',
      body: '**已有 Markdown**',
      folder: '日记/想法'
    },
    expectedVersion: 0,
    operationId: 'old-note'
  })
  await store.commit({
    entity: {
      ...meta,
      id: 'old-reading',
      kind: 'reading',
      question: '如何改善目前团队的信息沟通问题',
      relation: '先调查现状',
      review: '尝试一次小范围调整'
    },
    expectedVersion: 0,
    operationId: 'old-reading'
  })
  const first = await createDesktopApi(store, [])
  expect((await first.api.journal.list()).notes[0].markdown).toBe('**已有 Markdown**')
  expect(await first.api.sessions.list()).toHaveLength(1)
  const second = await createDesktopApi(store, [])
  expect((await second.api.journal.list()).notes).toHaveLength(1)
  expect(await second.api.sessions.list()).toHaveLength(1)
})
