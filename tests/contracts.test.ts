import { describe, expect, it } from 'vitest'
import { validateIpcArguments } from '../src/shared/contracts/ipc'
import { emptySessionData, emptyWorkbench, type WbAction } from '../src/shared/types'
import { applyWorkbenchCommands } from '../src/main/modules/workbench/public'
import { enqueueCandidates } from '../src/main/modules/workbench/action-planning'
import { decodeSessionData } from '../src/main/modules/sessions/public'
describe('runtime IPC contracts', () => {
  it('rejects missing versions, mutation IDs, unknown commands and arbitrary document patches', () => {
    for (const args of [
      ['s', [], undefined, undefined, undefined, 'id'],
      ['s', [], 0],
      ['s', [{ kind: 'book', value: 'another' }], 0, undefined, undefined, 'id']
    ])
      expect(() => validateIpcArguments('reading:apply', args)).toThrow('格式')
    expect(() =>
      validateIpcArguments('sessions:update', [
        's',
        { expectedStateVersion: 0, mutationId: 'id', data: emptySessionData() }
      ])
    ).toThrow('格式')
    expect(() =>
      validateIpcArguments('wb:apply', [
        's',
        [{ kind: 'diagnosisModule', module: 'routes', value: { primary: 'wrong shape' } }],
        0,
        undefined,
        undefined,
        'id'
      ])
    ).toThrow('格式')
  })
  it('rejects malformed notes and raw model settings and unregistered channels', () => {
    expect(() => validateIpcArguments('ai:reviewNotes', ['s', 'c', { action: 3 }])).toThrow('格式')
    expect(() => validateIpcArguments('models:save', [undefined, 'name', { apiKey: 5 }])).toThrow(
      '格式'
    )
    expect(() => validateIpcArguments('unknown', [])).toThrow('未定义')
  })
  it('accepts optional arguments and projects rich book objects only at scope boundaries', () => {
    expect(() => validateIpcArguments('sessions:create', ['问题'])).not.toThrow()
    expect(() =>
      validateIpcArguments('articles:list', [{ bookId: 'b', revisionId: 'r', title: '书名' }])
    ).not.toThrow()
    expect(() =>
      validateIpcArguments('reading:apply', ['s', [], 0, undefined, undefined, 'retry-id'])
    ).not.toThrow()
  })
  it('validates the workbench planning command payloads strictly', () => {
    const action: WbAction = {
      id: 'c1',
      horizon: '7d',
      action: '核实阻力',
      purpose: '先调查',
      verify: '3 次访谈',
      standards: ['实事求是'],
      kpi: '3 人',
      planningState: 'candidate',
      status: 'todo',
      progress: [],
      createdAt: '2026-10-24T00:00:00Z'
    }
    const queuedInput = {
      id: 'q1',
      horizon: '7d' as const,
      action: '联系客户',
      purpose: '',
      verify: '',
      standards: [],
      kpi: '',
      quadrant: 'plan' as const,
      dueDate: '2026-11-11'
    }
    const apply = (commands: unknown[]) => () =>
      validateIpcArguments('wb:apply', ['s', commands, 0, undefined, undefined, 'id'])

    for (const commands of [
      [{ kind: 'action', value: action }],
      [{ kind: 'enqueueActions', ids: ['c1', 'c2'] }],
      [{ kind: 'returnActionsToCandidates', ids: ['c1'] }],
      [{ kind: 'createQueuedAction', value: queuedInput }]
    ])
      expect(apply(commands)).not.toThrow()

    expect(apply([{ kind: 'enqueueActions', ids: ['c1', 2] }])).toThrow('格式')
    // IPC keeps a coarse upper bound; the 200-action rule belongs to the domain reducer.
    expect(
      apply([{ kind: 'enqueueActions', ids: Array.from({ length: 501 }, (_, i) => `a${i}`) }])
    ).toThrow('格式')
    const ids201 = Array.from({ length: 201 }, (_, i) => `a${i}`)
    expect(() =>
      applyWorkbenchCommands(emptyWorkbench('项目目标'), [{ kind: 'enqueueActions', ids: ids201 }])
    ).toThrow()
    expect(() => enqueueCandidates(emptyWorkbench('项目目标'), ids201)).toThrow(
      '一次最多处理 200 条行动'
    )

    for (const key of ['id', 'horizon', 'action', 'purpose', 'verify', 'standards', 'kpi']) {
      const value: Record<string, unknown> = { ...queuedInput }
      delete value[key]
      expect(apply([{ kind: 'createQueuedAction', value }])).toThrow('格式')
    }
    expect(
      apply([{ kind: 'createQueuedAction', value: { ...queuedInput, horizon: '1年' } }])
    ).toThrow('格式')
    expect(
      apply([{ kind: 'createQueuedAction', value: { ...queuedInput, quadrant: 'urgent' } }])
    ).toThrow('格式')
    expect(
      apply([{ kind: 'createQueuedAction', value: { ...queuedInput, status: 'todo' } }])
    ).toThrow('格式')
    expect(
      apply([{ kind: 'createQueuedAction', value: { ...queuedInput, progress: [] } }])
    ).toThrow('格式')

    const withoutPlanningState: Record<string, unknown> = { ...action }
    delete withoutPlanningState.planningState
    expect(apply([{ kind: 'action', value: withoutPlanningState }])).toThrow('格式')
    expect(apply([{ kind: 'action', value: { ...action, planningState: 'other' } }])).toThrow(
      '格式'
    )
  })
})
describe('legacy source normalization', () => {
  it('cleans legacy rich SourceRefs while preserving their stable identifiers', () => {
    const data = emptySessionData()
    delete data.schemaVersion
    data.diagnosis = {
      restated: '',
      symptoms: [],
      mainContradiction: '',
      stage: '',
      recommendations: [
        {
          articleId: 'c',
          title: '章',
          reason: '',
          focusQuestion: '',
          evidence: {
            paragraphIndex: 0,
            quote: '文',
            source: {
              bookId: 'b',
              revisionId: 'r',
              chapterId: 'c',
              paragraphId: 'p',
              title: '以前多余的标题'
            } as any
          }
        }
      ]
    }
    const result = decodeSessionData(data)
    expect(result.diagnosis?.recommendations[0].evidence?.source).toEqual({
      bookId: 'b',
      revisionId: 'r',
      chapterId: 'c',
      paragraphId: 'p'
    })
    expect((data.diagnosis.recommendations[0].evidence?.source as any).title).toBe('以前多余的标题')
  })
})
