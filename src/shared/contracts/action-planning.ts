import { object, optional, nullable, oneOf, text } from './validation'
export const actionEditSchema = object({
  text: optional(text),
  quadrant: optional(nullable(oneOf('do', 'plan', 'delegate', 'reduce'))),
  dueDate: optional(text),
  status: optional(oneOf('todo', 'done', 'dropped')),
  purpose: optional(text),
  verify: optional(text)
})
export interface ActionReference {
  sessionId: string
  actionId: string
}
export interface ClassificationResult {
  classified: number
  skipped: number
  failed: number
  errors: string[]
}
