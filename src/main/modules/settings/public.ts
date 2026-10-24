import {
  DEFAULT_READER_PREFERENCES,
  readerPreferencesSchema,
  type ReaderPreferences
} from '@shared/contracts/reader'
import { normalizeProxySettings, type ProxySettings } from '@shared/contracts/proxy'
import type { Settings } from '@shared/types'
import { settingsSchema } from '@shared/contracts/models'
import { activeModel, modelForPurpose, listModels, saveModel } from '../model-config/public'
export interface SettingsRepository {
  read(key: string): string | null
  write(key: string, value: string): void
  transaction<T>(work: () => T): T
  readSecret(): string
  writeSecret(value: string): void
}
let repo: SettingsRepository
let defaults: Partial<Settings> = {}
export function configureSettings(
  repository: SettingsRepository,
  environment: Partial<Settings> = {}
) {
  repo = repository
  defaults = environment
}
export function getSettings(purpose?: string): Settings {
  const model = (purpose ? modelForPurpose(purpose) : null) ?? activeModel()
  if (model) return model
  return {
    apiKey: repo.readSecret() || defaults.apiKey || '',
    baseUrl: repo.read('baseUrl') || defaults.baseUrl || 'https://api.deepseek.com/v1',
    model: repo.read('model') || defaults.model || 'deepseek-v4-flash',
    temperatureEnabled: repo.read('temperatureEnabled') !== 'false',
    streamUsage: repo.read('streamUsage') !== 'false'
  }
}
export function publicSettings(): Settings {
  const s = getSettings()
  return { ...s, apiKey: '', hasApiKey: !!s.apiKey }
}
export function setSettings(s: Settings): Settings {
  settingsSchema(s, 'settings')
  if (s.configId)
    saveModel(s.configId, listModels().find((m) => m.id === s.configId)?.name ?? '模型配置', s)
  else
    repo.transaction(() => {
      if (s.apiKey.trim()) repo.writeSecret(s.apiKey.trim())
      repo.write('baseUrl', s.baseUrl.trim().replace(/\/+$/, '') || 'https://api.deepseek.com/v1')
      repo.write('model', s.model.trim() || 'deepseek-v4-flash')
      repo.write('temperatureEnabled', String(s.temperatureEnabled !== false))
      repo.write('streamUsage', String(s.streamUsage !== false))
    })
  return publicSettings()
}

let applyProxy: (settings: ProxySettings) => Promise<void>
let proxyChanges: Promise<unknown> = Promise.resolve()
export async function configureProxy(
  apply: (settings: ProxySettings) => Promise<void>
): Promise<void> {
  applyProxy = apply
  await applyProxy(getProxySettings())
}
export function getProxySettings(): ProxySettings {
  const saved = repo.read('networkProxy')
  return saved ? normalizeProxySettings(JSON.parse(saved)) : { enabled: false, url: '' }
}
export function setProxySettings(input: ProxySettings): Promise<ProxySettings> {
  const next = normalizeProxySettings(input)
  const pending = proxyChanges.then(async () => {
    const previous = getProxySettings()
    await applyProxy(next)
    try {
      repo.transaction(() => repo.write('networkProxy', JSON.stringify(next)))
    } catch (error) {
      await applyProxy(previous)
      throw error
    }
    return next
  })
  proxyChanges = pending.catch(() => {})
  return pending
}

export function getReaderPreferences(): ReaderPreferences {
  const saved = repo.read('readerPreferences')
  if (!saved) return { ...DEFAULT_READER_PREFERENCES }
  const value = JSON.parse(saved)
  readerPreferencesSchema(value, 'readerPreferences')
  return value
}
export function setReaderPreferences(value: ReaderPreferences): ReaderPreferences {
  readerPreferencesSchema(value, 'readerPreferences')
  repo.transaction(() => repo.write('readerPreferences', JSON.stringify(value)))
  return getReaderPreferences()
}
