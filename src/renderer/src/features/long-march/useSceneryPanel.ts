import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE_MS = 5000

/** Hide the visual controls without unmounting the playing audio. */
export function useSceneryPanel(nodeId: string) {
  const [collapsed, setCollapsed] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current)
  }, [])
  const restartTimer = useCallback(() => {
    clearTimer()
    timer.current = setTimeout(function hideWhenIdle() {
      // Do not hide a control while a keyboard user is focused on it.
      if (panel.current?.querySelector(':focus-visible')) {
        timer.current = setTimeout(hideWhenIdle, IDLE_MS)
        return
      }
      setCollapsed(true)
    }, IDLE_MS)
  }, [clearTimer])
  useEffect(() => {
    setCollapsed(false)
    restartTimer()
    return clearTimer
  }, [nodeId, restartTimer, clearTimer])
  useEffect(() => {
    if (collapsed && panel.current?.contains(document.activeElement)) toggle.current?.focus()
  }, [collapsed])
  const expand = () => {
    setCollapsed(false)
    restartTimer()
  }
  const collapse = () => {
    clearTimer()
    setCollapsed(true)
  }
  return { collapsed, panel, toggle, expand, collapse, restartTimer, clearTimer }
}
