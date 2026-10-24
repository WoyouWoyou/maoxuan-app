import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * 页面内临时勾选：只服务于批量“加入待办 / 移回候选”，不写入会话或数据库。
 * 切换会话时清空；服务端刷新后自动剔除已删除或不再符合条件的 ID。
 * UI-only ephemeral selection: never persisted, never sent to the DB.
 */
export interface ActionSelection {
  selectedIds: string[]
  count: number
  isSelected(id: string): boolean
  toggle(id: string): void
  selectMany(ids: string[]): void
  clear(): void
}

export function useActionSelection(sessionId: string, selectableIds: string[]): ActionSelection {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 数组内容签名：调用方每次 render 都可能传新数组，但内容不变时不必清理选择。
  const selectableKey = selectableIds.join('\u0000')
  const selectable = useMemo(() => new Set(selectableIds), [selectableKey])

  useEffect(() => {
    setSelectedIds([])
  }, [sessionId])

  // 只保留当前仍可选的 ID（行动被删除、已加入待办、已有进展等都会退出范围）。
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => selectable.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [selectable])

  const toggle = useCallback(
    (id: string) => {
      if (!selectable.has(id)) return
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    },
    [selectable]
  )

  const selectMany = useCallback(
    (ids: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) if (selectable.has(id)) next.add(id)
        return [...next]
      })
    },
    [selectable]
  )

  const clear = useCallback(() => setSelectedIds([]), [])

  const isSelected = useCallback(
    (id: string) => selectable.has(id) && selectedIds.includes(id),
    [selectable, selectedIds]
  )

  // 渲染与提交都用过滤后的集合，避免清理 effect 落地前短暂带上失效 ID。
  const visibleIds = selectedIds.filter((id) => selectable.has(id))

  return {
    selectedIds: visibleIds,
    count: visibleIds.length,
    isSelected,
    toggle,
    selectMany,
    clear
  }
}
