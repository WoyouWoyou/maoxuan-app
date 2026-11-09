import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { ConflictError, type Snapshot } from '../domain/models'
import type { AtomicStore, Commit } from '../application/ports'
export async function createNativeStore(): Promise<AtomicStore> {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const db = await sqlite.createConnection('maoxuan_mobile', false, 'no-encryption', 1, false)
  await db.open()
  await db.execute(`CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS history_entity ON history(entity_id);
    CREATE TABLE IF NOT EXISTS outbox (operation_id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts (operation_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);`)
  // One private connection and one serialized gate for ALL access. No other caller can
  // interleave an await inside a native transaction. Network never enters this gate.
  let tail: Promise<unknown> = Promise.resolve()
  function exclusive<T>(job: () => Promise<T>): Promise<T> {
    const next = tail.then(job)
    tail = next.catch(() => {})
    return next
  }
  async function transaction(job: () => Promise<void>) {
    await db.beginTransaction()
    try {
      await job()
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }
  return {
    snapshot: () =>
      exclusive(async () => {
        const read = async (table: string) =>
          (await db.query(`SELECT data FROM ${table}`)).values?.map((r) => JSON.parse(r.data)) ?? []
        return {
          entities: await read('entities'),
          history: await read('history'),
          outbox: await read('outbox')
        } as Snapshot
      }),
    async commit(this: AtomicStore, c: Commit) {
      return this.batch([c])
    },
    batch: (commands) =>
      exclusive(() =>
        transaction(async () => {
          for (const c of commands) {
            const fingerprint = JSON.stringify(c)
            const receipt = (
              await db.query('SELECT fingerprint FROM receipts WHERE operation_id = ?', [
                c.operationId
              ])
            ).values?.[0]
            if (receipt) {
              if (receipt.fingerprint !== fingerprint) throw new Error('操作 ID 已用于其他内容')
              continue
            }
            const current = (
              await db.query('SELECT version FROM entities WHERE id = ?', [c.entity.id])
            ).values?.[0]
            if ((current?.version ?? 0) !== c.expectedVersion) throw new ConflictError()
            await db.run(
              'INSERT OR REPLACE INTO entities VALUES (?, ?, ?)',
              [c.entity.id, c.entity.version, JSON.stringify(c.entity)],
              false
            )
            await db.run(
              'INSERT INTO history VALUES (?, ?, ?)',
              [
                c.operationId,
                c.entity.id,
                JSON.stringify({ id: c.operationId, entityId: c.entity.id, snapshot: c.entity })
              ],
              false
            )
            await db.run(
              'INSERT INTO outbox VALUES (?, ?)',
              [
                c.operationId,
                JSON.stringify({
                  operationId: c.operationId,
                  entityId: c.entity.id,
                  baseVersion: c.expectedVersion,
                  payload: c.entity
                })
              ],
              false
            )
            await db.run('INSERT INTO receipts VALUES (?, ?)', [c.operationId, fingerprint], false)
          }
        })
      ),
    restore: (s) =>
      exclusive(() =>
        transaction(async () => {
          for (const table of ['entities', 'history', 'outbox', 'receipts'])
            await db.execute(`DELETE FROM ${table}`, false)
          for (const e of s.entities)
            await db.run(
              'INSERT INTO entities VALUES (?, ?, ?)',
              [e.id, e.version, JSON.stringify(e)],
              false
            )
          for (const h of s.history)
            await db.run(
              'INSERT INTO history VALUES (?, ?, ?)',
              [h.id, h.entityId, JSON.stringify(h)],
              false
            )
          for (const o of s.outbox)
            await db.run(
              'INSERT INTO outbox VALUES (?, ?)',
              [o.operationId, JSON.stringify(o)],
              false
            )
        })
      )
  }
}
