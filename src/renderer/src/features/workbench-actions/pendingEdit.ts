import type { WbAction } from '@shared/types'

/**
 * 编辑草稿与“已保存的行动”比较，决定批量提交前是否要被拦住。
 *
 * 背景：批量“加入待办 / 移回候选”只提交行动 ID，不提交文本。如果用户改了候选但
 * 没保存，提交会把数据库里的旧文本纳入待办——界面上看到的修订没有进入推送结果。
 * 所以批量提交前必须能判断“当前编辑有没有未保存的修改”。
 */
export interface ActionDraftLike {
  action: string
  purpose: string
  verify: string
  kpi: string
  horizon: string
  standards: string[]
}

/** 未保存编辑的统一提示：批量提交与工具栏共用同一句话。 */
export const UNSAVED_EDIT_NOTICE = '有未保存的修改，请先保存或取消编辑'

function sameStandards(a: string[], b: string[]): boolean {
  // 执行标准的顺序没有意义：先去掉重复再按集合比较，避免仅调整顺序就判为“改过”。
  const left = new Set(a)
  const right = new Set(b)
  if (left.size !== right.size) return false
  for (const item of left) if (!right.has(item)) return false
  return true
}

/** 草稿与已保存的行动是否一致；任一字段不同即为“有未保存的修改”。 */
export function actionDraftDirty(draft: ActionDraftLike, action: WbAction): boolean {
  if (draft.action !== action.action) return true
  if (draft.purpose !== action.purpose) return true
  if (draft.verify !== action.verify) return true
  if (draft.kpi !== action.kpi) return true
  if (draft.horizon !== action.horizon) return true
  return !sameStandards(draft.standards, action.standards ?? [])
}
