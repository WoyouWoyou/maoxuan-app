import type { Settings } from '@shared/types'
import { publicSettings, setSettings, getSettings } from '../sqlite/session-repository'
import { testConnection } from '../../modules/model-runtime/public'
import { register, requireSession, requireArticle, requireWorkbench, toError } from './transport'
export function registerSettingsHandlers(): void {
  register<[], Settings>('settings:get', () => publicSettings())
  register<[Settings], Settings>('settings:set', (settings) => setSettings(settings))
  register<[], { ok: boolean; message: string }>('settings:test', () => {
    try {
      return testConnection(getSettings())
    } catch (error) {
      throw toError(error)
    }
  })
}
