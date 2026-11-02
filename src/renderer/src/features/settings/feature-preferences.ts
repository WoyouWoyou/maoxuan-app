import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_FEATURE_PREFERENCES, type FeaturePreferences } from '@shared/contracts/features'
let state = { preferences: DEFAULT_FEATURE_PREFERENCES, loaded: false, saving: false, error: '' }
const listeners = new Set<() => void>()
let loading: Promise<void> | undefined
let generation = 0
const emit = () => listeners.forEach((listener) => listener())
function refresh() {
  if (loading || state.saving) return loading
  const request = ++generation
  loading = window.api.settings
    .getFeatures()
    .then((preferences) => {
      if (request === generation) {
        state = { ...state, preferences, loaded: true, error: '' }
        emit()
      }
    })
    .catch((error) => {
      if (request === generation) {
        state = {
          ...state,
          loaded: true,
          error: String(error instanceof Error ? error.message : error)
        }
        emit()
      }
    })
    .finally(() => {
      loading = undefined
    })
  return loading
}
async function update(preferences: FeaturePreferences) {
  if (state.saving) return
  ++generation
  state = { ...state, saving: true, error: '' }
  emit()
  try {
    const saved = await window.api.settings.setFeatures(preferences)
    state = { ...state, preferences: saved, loaded: true, saving: false }
    emit()
  } catch (error) {
    state = {
      ...state,
      saving: false,
      error: String(error instanceof Error ? error.message : error)
    }
    emit()
  }
}
export function useFeaturePreferences() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => state
  )
  useEffect(() => {
    if (!state.loaded) void refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  return { ...snapshot, update, refresh }
}
