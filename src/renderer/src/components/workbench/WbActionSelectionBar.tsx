import type { ReactNode } from 'react'

export interface WbActionSelectionBarProps {
  count: number
  busy: boolean
  actionLabel: string
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
  onAction,
  onClear,
  notice
}: WbActionSelectionBarProps) {
  const disabled = count === 0 || busy
  return (
    <div className="wbx-selectbar" role="toolbar" aria-label={`批量操作：${actionLabel}`}>
      {notice ? <div className="wbx-selectbar-notice">{notice}</div> : null}
      <span className="wbx-selectbar-count">已选 {count} 条</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={disabled}
        onClick={onAction}
      >
        {actionLabel}（{count}）
      </button>
      <button type="button" className="btn btn-sm btn-ghost" disabled={disabled} onClick={onClear}>
        取消选择
      </button>
    </div>
  )
}
