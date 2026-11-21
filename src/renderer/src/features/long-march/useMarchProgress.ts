import { useCallback, useEffect, useRef, useState } from 'react'
import type { MarchProgress } from '@shared/long-march'

export function useMarchProgress() {
  const [progress, setProgress] = useState<MarchProgress | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const writing = useRef(false)
  const request = useRef<{ nodeId: string; id: string } | null>(null)
  const refresh = useCallback(async () => {
    try {
      const next = await window.api.march.get()
      if (alive.current) {
        setProgress(next)
        setError('')
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60000)
    window.addEventListener('focus', refresh)
    window.addEventListener('sessions-changed', refresh)
    return () => {
      window.clearInterval(timer)
      alive.current = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('sessions-changed', refresh)
    }
  }, [refresh])
  const plant = async (nodeId: string) => {
    if (writing.current) return null
    writing.current = true
    setBusy(true)
    setError('')
    // Retain the request ID on transport failure so a retry cannot spend twice.
    if (request.current?.nodeId !== nodeId) request.current = { nodeId, id: crypto.randomUUID() }
    try {
      const next = await window.api.march.plant(nodeId, request.current.id)
      request.current = null
      if (alive.current) setProgress(next)
      return next
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      writing.current = false
      if (alive.current) setBusy(false)
    }
  }
  const collect = async (nodeId: string) => {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    try {
      const next = await window.api.march.collect(nodeId)
      if (alive.current) {
        setProgress(next)
        setError('')
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      writing.current = false
      if (alive.current) setBusy(false)
    }
  }
  return { progress, error, busy, refresh, plant, collect }
}
