import type Database from 'better-sqlite3'
import type { Task } from '@shared/contracts/library'
export function createTaskRepository(db: Database.Database) {
  function get(id: string): Task {
    const r = db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as any
    if (!r) throw new Error('任务不存在')
    return { ...r, createdAt: r.created_at, updatedAt: r.updated_at }
  }
  return {
    findActive: (kind: Task['kind'], scope: string): Task | undefined => {
      const row = db
        .prepare(
          "SELECT id FROM tasks WHERE kind=? AND scope=? AND status IN ('queued','running') LIMIT 1"
        )
        .get(kind, scope) as { id: string } | undefined
      return row ? get(row.id) : undefined
    },
    get,
    list: () =>
      (
        db.prepare('SELECT id FROM tasks ORDER BY created_at DESC LIMIT 100').all() as {
          id: string
        }[]
      ).map((r) => get(r.id)),
    create: (task: Task) => {
      db.prepare(
        'INSERT INTO tasks(id,kind,scope,status,created_at,updated_at) VALUES(?,?,?,?,?,?)'
      ).run(task.id, task.kind, task.scope, task.status, task.createdAt, task.updatedAt)
    },
    patch: (id: string, values: Partial<Task>) => {
      const t = { ...get(id), ...values }
      db.prepare(
        'UPDATE tasks SET status=?,progress=?,total=?,error=?,result=?,revision=revision+1,updated_at=? WHERE id=?'
      ).run(t.status, t.progress, t.total, t.error, t.result, new Date().toISOString(), id)
    },
    recover: () => {
      db.prepare(
        "UPDATE tasks SET status='interrupted',error='应用已重启，可重新开始；已完成的索引块会复用',revision=revision+1 WHERE status IN ('running','queued')"
      ).run()
    }
  }
}
