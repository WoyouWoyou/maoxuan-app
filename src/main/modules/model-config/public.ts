import type { Settings } from '@shared/types'
import { settingsSchema } from '@shared/contracts/models'
import { text, optional } from '@shared/contracts/validation'
import type { ModelProfile } from '@shared/contracts/models'
export interface ModelConfigRepository {
  forPurpose(purpose: string): Settings | null
  routes(): Record<string, string>
  setRoute(purpose: string, id: string): void
  list(): ModelProfile[]
  active(): Settings | null
  save(id: string | undefined, name: string, settings: Settings): ModelProfile
  select(id: string): void
}
let repository: ModelConfigRepository | undefined
export function configureModels(value: ModelConfigRepository) {
  repository = value
}
export function activeModel(): Settings | null {
  return repository?.active() ?? null
}
export function listModels(): ModelProfile[] {
  return repository?.list() ?? []
}
export function saveModel(id: string | undefined, name: string, settings: Settings): ModelProfile {
  settingsSchema(settings, 'settings')
  optional(text)(id, 'configId')
  text(name, 'name')
  if (!repository) throw new Error('模型配置尚未初始化')
  return repository.save(id, name, settings)
}
export function selectModel(id: string): void {
  if (!repository) throw new Error('模型配置尚未初始化')
  repository.select(id)
}

export function modelForPurpose(purpose: string): Settings | null {
  return repository?.forPurpose(purpose) ?? null
}
export function modelRoutes(): Record<string, string> {
  return repository?.routes() ?? {}
}
export function setModelRoute(purpose: string, id: string): void {
  if (!['reading', 'workbench', 'index'].includes(purpose)) throw new Error('模型用途无效')
  repository?.setRoute(purpose, id)
}
