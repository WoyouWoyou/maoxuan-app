import type { ReactNode } from 'react'

export interface WbActionSelectionBarProps {
  count: number
  busy: boolean
  actionLabel: string
  /** 有未保存编辑时的拦阻原因：按钮禁用并显示原因，而不是静默提交旧内容。 */
  blockedReason?: string
  onAction: () => void
  onClear: () => void
  /** 批次反馈 / 失败重试放在工具栏内，滚动时始终可见 */
  notice?: ReactNode
}

/** 候选与已加入待办共用的粘性批量操作栏。 */
export function WbActionSelectionBar({
  count,
  busy,
  actionLabel,
  blockedReason = '',
  onAction,
  onClear,
  notice
}: WbActionSelectionBarProps) {
  const blocked = Boolean(blockedReason)
  const disabled = count === 0 || busy || blocked
  return (
    <div className="wbx-selectbar" role="toolbar" aria-label={`批量操作：${actionLabel}`}>
      {notice ? <div className="wbx-selectbar-notice">{notice}</div> : null}
      <span className="wbx-selectbar-count">已选 {count} 条</span>
      {blocked ? (
        <span className="wbx-selectbar-hint" role="status">
          {blockedReason}
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={disabled}
        title={blocked ? blockedReason : undefined}
        onClick={onAction}
      >
        {actionLabel}（{count}）
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={count === 0 || busy}
        onClick={onClear}
      >
        取消选择
      </button>
    </div>
  )
}
