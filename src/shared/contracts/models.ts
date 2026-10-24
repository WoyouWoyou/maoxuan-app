import type { Settings } from '../types'
export interface ModelProfile {
  id: string
  name: string
  settings: Settings
  active: boolean
}

import { object, optional, bool, text } from './validation'
export const settingsSchema = object({
  configId: optional(text),
  hasApiKey: optional(bool),
  apiKey: text,
  baseUrl: text,
  model: text,
  temperatureEnabled: optional(bool),
  streamUsage: optional(bool)
})
