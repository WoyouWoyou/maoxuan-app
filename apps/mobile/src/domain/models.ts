import { z } from 'zod'
import { desktopPayloadSchema } from '../application/desktop-record'
export const sourceSchema = z.object({
  articleId: z.string(),
  revisionId: z.string(),
  paragraph: z.number().int().nonnegative(),
  quote: z.string().max(50000)
})
const common = {
  id: z.string().min(1).max(200),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime()
}
export const noteSchema = z.object({
  ...common,
  kind: z.literal('note'),
  title: z.string().min(1).max(200),
  body: z.string().max(100000),
  folder: z.string().max(100),
  source: sourceSchema.optional()
})
export const actionSchema = z
  .object({
    ...common,
    kind: z.literal('action'),
    title: z.string().min(1).max(500),
    planningState: z.enum(['candidate', 'queued']),
    status: z.enum(['todo', 'done', 'dropped']),
    progress: z.string().max(10000),
    readingId: z.string().optional()
  })
  .refine(
    (a) => a.planningState === 'queued' || (a.status === 'todo' && !a.progress),
    '候选行动不能完成、放弃或记录进展'
  )
export const readingSchema = z.object({
  ...common,
  kind: z.literal('reading'),
  question: z.string().min(1).max(2000),
  source: sourceSchema.optional(),
  relation: z.string().max(10000),
  review: z.string().max(10000)
})
export const progressSchema = z.object({
  ...common,
  kind: z.literal('progress'),
  articleId: z.string(),
  paragraph: z.number().int().nonnegative()
})
export const preferencesSchema = z.object({
  ...common,
  kind: z.literal('preferences'),
  fontSize: z.number().min(16).max(28),
  theme: z.enum(['paper', 'night'])
})
export const bookSchema = z.object({
  ...common,
  kind: z.literal('book'),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000000),
  revisionId: z.string().regex(/^[a-f0-9]{64}$/)
})
export const desktopSchema = z.object({
  ...common,
  kind: z.literal('desktop'),
  payload: desktopPayloadSchema
})
export const entitySchema = z.union([
  desktopSchema,
  noteSchema,
  actionSchema,
  readingSchema,
  progressSchema,
  preferencesSchema,
  bookSchema
])
export type Entity = z.infer<typeof entitySchema>
export type Note = z.infer<typeof noteSchema>
export type Action = z.infer<typeof actionSchema>
export type Reading = z.infer<typeof readingSchema>
export type Source = z.infer<typeof sourceSchema>
export interface Article {
  id: string
  title: string
  volume: string
  content: string
  revisionId: string
  isCore: boolean
  coreOrder: number | null
}
export interface History {
  id: string
  entityId: string
  snapshot: Entity
}
export interface Outbox {
  operationId: string
  entityId: string
  baseVersion: number
  payload: Entity
}
export interface Snapshot {
  entities: Entity[]
  history: History[]
  outbox: Outbox[]
}
export class ConflictError extends Error {
  constructor() {
    super('内容已在另一页面更新，请重新打开后编辑。你的输入仍保留在此。')
  }
}
export function paragraphs(article: Article) {
  return article.content
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x && x !== '*')
}
export function validateSource(source: Source, articles: Article[]) {
  const article = articles.find(
    (a) => a.id === source.articleId && a.revisionId === source.revisionId
  )
  if (!article || paragraphs(article)[source.paragraph] !== source.quote)
    throw new Error('引用与原文版本不符，无法保存。')
}
export function transition(
  action: Action,
  command: 'enqueue' | 'return' | 'complete' | 'drop' | 'reopen'
): Action {
  if (command === 'enqueue') return { ...action, planningState: 'queued' }
  if (command === 'return') {
    if (action.status !== 'todo' || action.progress)
      throw new Error('已有结果或阶段进展的行动不能退回候选。')
    return { ...action, planningState: 'candidate' }
  }
  if (action.planningState !== 'queued') throw new Error('请先将候选纳入待办。')
  return {
    ...action,
    status: command === 'complete' ? 'done' : command === 'drop' ? 'dropped' : 'todo'
  }
}
export const newMeta = () => ({
  id: crypto.randomUUID(),
  version: 1,
  updatedAt: new Date().toISOString()
})
