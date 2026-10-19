import { useEffect, useSyncExternalStore } from 'react'
import type { Book } from '@shared/contracts/library'
let books: Book[] = []
const listeners = new Set<() => void>()
export async function refreshBooks(): Promise<void> {
  books = await window.api.library.list()
  listeners.forEach((fn) => fn())
}
export function useBooks(): Book[] {
  const state = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => books
  )
  useEffect(() => {
    void refreshBooks().catch(() => {})
  }, [])
  return state
}
