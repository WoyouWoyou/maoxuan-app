import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActionItem, Session } from '@shared/types'
import {
  actionCommands,
  collectActions,
  standaloneAction,
  newAction,
  localDay,
  type ActionEdit,
  type HubAction
} from '@shared/actions'

import { ActionHubContext } from './context'
export function ActionHubProvider({ children }: { children: ReactNode }) {
  const [standalone, setStandalone] = useState<ActionItem[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const reload = useCallback(async () => {
    const request = ++sequence.current
    try {
      const [active, archived, independent] = await Promise.all([
        window.api.sessions.list(),
        window.api.sessions.listArchived(),
        window.api.actions.list()
      ])
      const ids = [...new Set([...active, ...archived].map((s) => s.id))]
      const loaded = await Promise.all(ids.map((id) => window.api.sessions.get(id)))
      if (sequence.current === request) {
        setStandalone(independent)
        setSessions(loaded.filter((s): s is Session => !!s && !s.deletedAt))
        setError('')
      }
    } catch (e) {
      if (sequence.current === request) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (sequence.current === request) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
    const refresh = () => {
      void reload()
    }
    window.addEventListener('sessions-changed', refresh)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 15000)
    return () => {
      ++sequence.current
      window.removeEventListener('sessions-changed', refresh)
      window.removeEventListener('focus', refresh)
      window.clearInterval(timer)
    }
  }, [reload])
  const mutate = useCallback(
    (id: string, build: (s: Session) => ReturnType<typeof actionCommands>, label: string) => {
      const work = queue.current.then(async () => {
        const latest = await window.api.sessions.get(id)
        if (!latest) throw new Error('原问题不存在，请刷新列表')
        const commands = build(latest)
        const next =
          latest.mode === 'reading'
            ? await window.api.reading.apply(id, commands.reading, latest.stateVersion, label)
            : await window.api.wb.apply(id, commands.workbench, latest.stateVersion, label)
        ++sequence.current
        setSessions((previous) => previous.map((s) => (s.id === next.id ? next : s)))
        window.dispatchEvent(new Event('sessions-changed'))
      })
      queue.current = work.catch(() => undefined)
      return work
    },
    []
  )
  const edit = useCallback(
    (task: HubAction, change: ActionEdit, progress?: string) => {
      if (task.mode === 'default') {
        const work = queue.current.then(async () => {
          const next = await window.api.actions.edit(task.id, change, progress)
          ++sequence.current
          setStandalone((previous) => previous.map((a) => (a.id === next.id ? next : a)))
          window.dispatchEvent(new Event('sessions-changed'))
        })
        queue.current = work.catch(() => undefined)
        return work
      }
      const entry = progress?.trim()
        ? { id: crypto.randomUUID(), text: progress.trim(), createdAt: new Date().toISOString() }
        : undefined
      return mutate(
        task.sessionId,
        (s) => actionCommands(s, task.id, change, entry),
        entry
          ? '四象限：记录进展'
          : change.status === 'done'
            ? '四象限：完成行动'
            : '四象限：更新行动'
      )
    },
    [mutate]
  )
  const add = useCallback(
    async (sessionId: string, change: ActionEdit) => {
      if (!sessionId) {
        let key = ''
        const work = queue.current.then(async () => {
          const next = await window.api.actions.create(change)
          ++sequence.current
          setStandalone((previous) => [...previous, next])
          key = `:${next.id}`
          window.dispatchEvent(new Event('sessions-changed'))
        })
        queue.current = work.catch(() => undefined)
        await work
        return key
      }
      const id = crypto.randomUUID(),
        now = new Date().toISOString()
      await mutate(sessionId, (s) => newAction(s, id, change, now), '四象限：添加行动')
      return `${sessionId}:${id}`
    },
    [mutate]
  )
  const classify = useCallback(
    async (tasks: HubAction[]) => {
      await queue.current
      try {
        return await window.api.actions.classify(
          tasks.map((t) => ({ sessionId: t.sessionId, actionId: t.id })),
          localDay()
        )
      } finally {
        await reload()
        window.dispatchEvent(new Event('sessions-changed'))
      }
    },
    [reload]
  )
  const value = useMemo(
    () => ({
      sessions,
      tasks: [...standalone.map(standaloneAction), ...collectActions(sessions)],
      loading,
      error,
      reload,
      edit,
      add,
      classify
    }),
    [sessions, standalone, loading, error, reload, edit, add, classify]
  )
  return <ActionHubContext.Provider value={value}>{children}</ActionHubContext.Provider>
}
