import { describe, expect, it } from 'vitest'
import type { WbAction } from '../src/shared/types'
import {
  UNSAVED_EDIT_NOTICE,
  actionDraftDirty,
  type ActionDraftLike
} from '../src/renderer/src/features/workbench-actions/pendingEdit'

function makeAction(overrides: Partial<WbAction> = {}): WbAction {
  return {
    id: 'a1',
    horizon: '7d',
    action: '访谈2位同事',
    purpose: '收集事实',
    verify: '记录2份访谈',
    standards: ['调查研究', '集中兵力'],
    kpi: '2份记录',
    planningState: 'candidate',
    status: 'todo',
    progress: [],
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides
  }
}

/** 编辑表单打开时的草稿：与已保存的行动逐字一致。 */
function draftOf(action: WbAction): ActionDraftLike {
  return {
    action: action.action,
    purpose: action.purpose,
    verify: action.verify,
    kpi: action.kpi,
    horizon: action.horizon,
    standards: [...action.standards]
  }
}

describe('actionDraftDirty', () => {
  it('treats a freshly opened edit form as saved', () => {
    const action = makeAction()
    expect(actionDraftDirty(draftOf(action), action)).toBe(false)
  })

  it('detects unsaved edits on every editable field', () => {
    const action = makeAction()
    const cases: Array<[string, ActionDraftLike]> = [
      ['action', { ...draftOf(action), action: '只访谈1位同事（人工筛选后缩减）' }],
      ['purpose', { ...draftOf(action), purpose: '另一个目的' }],
      ['verify', { ...draftOf(action), verify: '另一份验证' }],
      ['kpi', { ...draftOf(action), kpi: '另一个指标' }],
      ['horizon', { ...draftOf(action), horizon: '30d' }],
      ['standards removed', { ...draftOf(action), standards: ['调查研究'] }],
      ['standards added', { ...draftOf(action), standards: ['调查研究', '集中兵力', '试点推进'] }]
    ]
    for (const [label, draft] of cases) {
      expect(actionDraftDirty(draft, action), label).toBe(true)
    }
  })

  it('ignores execution-standard order, which carries no meaning', () => {
    const action = makeAction()
    const draft = { ...draftOf(action), standards: ['集中兵力', '调查研究'] }
    expect(actionDraftDirty(draft, action)).toBe(false)
  })

  it('is not fooled by a missing standards array on the stored action', () => {
    const action = makeAction({ standards: [] })
    expect(actionDraftDirty({ ...draftOf(action), standards: [] }, action)).toBe(false)
    expect(actionDraftDirty({ ...draftOf(action), standards: ['调查研究'] }, action)).toBe(true)
  })

  it('exposes one shared notice for the batch bar and the submit guard', () => {
    // 批量加入 / 移回在编辑未保存时必须能说清“为什么点不了”，文案由 UI 与守护逻辑共用。
    expect(UNSAVED_EDIT_NOTICE).toContain('保存')
    expect(UNSAVED_EDIT_NOTICE).toContain('取消编辑')
  })
})
