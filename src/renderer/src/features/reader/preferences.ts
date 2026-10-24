import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_READER_PREFERENCES, type ReaderPreferences } from '@shared/contracts/reader'
let state = { preferences: DEFAULT_READER_PREFERENCES, loaded: false, error: '' }
const listeners = new Set<() => void>()
let loading: Promise<void> | undefined
let writes = Promise.resolve()
function emit() {
  listeners.forEach((fn) => fn())
}
function load() {
  loading ??= window.api.settings
    .getReader()
    .then((preferences) => {
      state = { preferences, loaded: true, error: '' }
      emit()
    })
    .catch((error) => {
      state = { ...state, loaded: false, error: `读取阅读选项失败：${String(error)}` }
      emit()
      loading = undefined
    })
}
export function updateReaderPreferences(patch: Partial<ReaderPreferences>) {
  const previous = state.preferences
  const next = { ...previous, ...patch }
  state = { ...state, preferences: next, error: '' }
  emit()
  writes = writes.then(async () => {
    try {
      await window.api.settings.setReader(next)
    } catch (error) {
      state = {
        ...state,
        preferences: state.preferences === next ? previous : state.preferences,
        error: `保存阅读选项失败：${String(error)}`
      }
      emit()
    }
  })
}
export function useReaderPreferences() {
  const snapshot = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => state
  )
  useEffect(load, [])
  return { ...snapshot, update: updateReaderPreferences }
}
