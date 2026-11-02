import { bool, object } from './validation'
export interface FeaturePreferences {
  longMarch: boolean
}
export const DEFAULT_FEATURE_PREFERENCES: FeaturePreferences = { longMarch: true }
export const featurePreferencesSchema = object({ longMarch: bool })
