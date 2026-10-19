import { useEffect, useState } from 'react'
import type { Task } from '@shared/contracts/library'
export function useTasks(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([])
  useEffect(() => {
    let alive = true
    const merge = (t: Task) =>
      setTasks((previous) => {
        const found = previous.find((x) => x.id === t.id)
        return found && found.revision >= t.revision
          ? previous
          : [t, ...previous.filter((x) => x.id !== t.id)]
      })
    const off = window.api.tasks.onChanged(merge)
    const load = () =>
      window.api.tasks
        .list()
        .then((list) => {
          if (alive) list.forEach(merge)
        })
        .catch(() => {})
    void load()
    const timer = window.setInterval(() => void load(), 2500)
    return () => {
      alive = false
      off()
      window.clearInterval(timer)
    }
  }, [])
  return tasks
}
