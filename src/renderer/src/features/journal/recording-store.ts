interface Draft {
  id: string
  noteId: string
  mime: string
  chunks: Blob[]
  updatedAt: number
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('maoxuan-journal-recordings', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' })
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function access<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode)
    const r = work(tx.objectStore('drafts'))
    tx.oncomplete = () => {
      db.close()
      resolve(r.result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  })
}
export const recordingStore = {
  save: (draft: Draft) => access('readwrite', (store) => store.put(draft)),
  remove: (id: string) => access('readwrite', (store) => store.delete(id)),
  list: () => access<Draft[]>('readonly', (store) => store.getAll())
}
