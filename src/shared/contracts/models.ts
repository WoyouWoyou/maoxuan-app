import type { Settings } from '../types'
export interface ModelProfile {
  id: string
  name: string
  settings: Settings
  active: boolean
}
