import { randomUUID } from 'node:crypto'
import type { Task } from '@shared/contracts/library'
export interface TaskRepository {
  findActive(kind: Task['kind'], scope: string): Task | undefined
  get(id: string): Task
  list(): Task[]
  create(task: Task): void
  patch(id: string, values: Partial<Task>): void
  recover(): void
}
let repository: TaskRepository
let notify: (task: Task) => void = () => {}
const active = new Map<string, AbortController>()
const queue: { id: string; work: Work }[] = []
type Work = (
  signal: AbortSignal,
  progress: (n: number, total: number) => void,
  id: string
) => Promise<string>
export function configureTasks(value: TaskRepository, emit?: (task: Task) => void): void {
  repository = value
  notify = emit ?? (() => {})
  repository.recover()
}
export const getTask = (id: string): Task => repository.get(id)
export const listTasks = (): Task[] => repository.list()
function patch(id: string, values: Partial<Task>) {
  repository.patch(id, values)
  notify(getTask(id))
}
export function startTask(kind: Task['kind'], scope: string, work: Work): Task {
  const existing = repository.findActive(kind, scope)
  if (existing) return existing
  if (queue.length >= 32) throw new Error('后台任务过多，请稍后再试')
  const id = randomUUID(),
    now = new Date().toISOString()
  repository.create({
    id,
    kind,
    scope,
    status: 'queued',
    progress: 0,
    total: 0,
    error: null,
    result: null,
    revision: 0,
    createdAt: now,
    updatedAt: now
  })
  queue.push({ id, work })
  queueMicrotask(pump)
  return getTask(id)
}
function pump(): void {
  while (active.size < 2 && queue.length) {
    const { id, work } = queue.shift()!
    if (getTask(id).status !== 'queued') continue
    const controller = new AbortController()
    active.set(id, controller)
    patch(id, { status: 'running' })
    void work(controller.signal, (progress, total) => patch(id, { progress, total }), id)
      .then((result) => {
        // A completed atomic import is success even if cancellation arrived after commit.
        patch(id, { status: 'succeeded', result })
      })
      .catch((e) =>
        patch(id, {
          status: controller.signal.aborted ? 'cancelled' : 'failed',
          error: e instanceof Error ? e.message : '任务失败'
        })
      )
      .finally(() => {
        active.delete(id)
        pump()
      })
  }
}
export function cancelTask(id: string): void {
  const t = getTask(id)
  if (t.status === 'queued') patch(id, { status: 'cancelled' })
  active.get(id)?.abort()
}
