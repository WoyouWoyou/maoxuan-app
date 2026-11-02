import { ConflictError, type Snapshot } from '../domain/models'
import type { AtomicStore, Commit } from '../application/ports'
const names = ['entities', 'history', 'outbox', 'receipts'] as const
export async function createBrowserStore(name = 'maoxuan-mobile-v1'): Promise<AtomicStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(name, 1)
    open.onupgradeneeded = () =>
      names.forEach((n) =>
        open.result.createObjectStore(n, {
          keyPath: n === 'entities' || n === 'history' ? 'id' : 'operationId'
        })
      )
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  const request = <T>(r: IDBRequest<T>) =>
    new Promise<T>((ok, no) => {
      r.onsuccess = () => ok(r.result)
      r.onerror = () => no(r.error)
    })
  const done = (tx: IDBTransaction) =>
    new Promise<void>((ok, no) => {
      tx.oncomplete = () => ok()
      tx.onabort = () => no(tx.error ?? new ConflictError())
      tx.onerror = () => {}
    })
  return {
    async snapshot() {
      const tx = db.transaction([...names], 'readonly')
      const completion = done(tx)
      const [entities, history, outbox] = await Promise.all(
        ['entities', 'history', 'outbox'].map((n) => request(tx.objectStore(n).getAll()))
      )
      await completion
      return { entities, history, outbox } as Snapshot
    },
    async commit(this: AtomicStore, c: Commit) {
      return this.batch([c])
    },
    async batch(commands: Commit[]) {
      const tx = db.transaction([...names], 'readwrite')
      const completion = done(tx)
      // All requests remain inside one IDB transaction, including CAS and receipt.
      for (const c of commands) {
        const receipt = tx.objectStore('receipts').get(c.operationId)
        receipt.onsuccess = () => {
          if (receipt.result) {
            if (receipt.result.fingerprint !== JSON.stringify(c)) tx.abort()
            return
          }
          const current = tx.objectStore('entities').get(c.entity.id)
          current.onsuccess = () => {
            if ((current.result?.version ?? 0) !== c.expectedVersion) {
              tx.abort()
              return
            }
            tx.objectStore('entities').put(c.entity)
            tx.objectStore('history').put({
              id: c.operationId,
              entityId: c.entity.id,
              snapshot: c.entity
            })
            tx.objectStore('outbox').put({
              operationId: c.operationId,
              entityId: c.entity.id,
              baseVersion: c.expectedVersion,
              payload: c.entity
            })
            tx.objectStore('receipts').put({
              operationId: c.operationId,
              fingerprint: JSON.stringify(c)
            })
          }
        }
      }
      await completion
    },
    async restore(s) {
      const tx = db.transaction([...names], 'readwrite')
      const completion = done(tx)
      names.forEach((n) => tx.objectStore(n).clear())
      s.entities.forEach((e) => tx.objectStore('entities').put(e))
      s.history.forEach((e) => tx.objectStore('history').put(e))
      s.outbox.forEach((e) => tx.objectStore('outbox').put(e))
      await completion
    }
  }
}
