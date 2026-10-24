import type { Settings } from '@shared/types'
import {
  getReaderPreferences,
  setReaderPreferences,
  publicSettings,
  setSettings,
  getSettings,
  getProxySettings,
  setProxySettings
} from '../../modules/settings/public'
import { testConnection } from '../../modules/model-runtime/public'
import { register, toError } from './transport'
export function registerSettingsHandlers(): void {
  register('settings:getReader', getReaderPreferences)
  register('settings:setReader', setReaderPreferences)
  register('settings:getProxy', () => getProxySettings())
  register('settings:setProxy', setProxySettings)
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
