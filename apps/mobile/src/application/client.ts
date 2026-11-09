import { z } from 'zod'
import {
  entitySchema,
  newMeta,
  paragraphs,
  validateSource,
  transition,
  type Action,
  type Article,
  type Entity,
  type Snapshot
} from '../domain/models'
import type { AtomicStore } from './ports'
const backupSchema = z.object({
  format: z.literal('maoxuan-mobile'),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  entities: z.array(entitySchema).max(50000),
  history: z
    .array(z.object({ id: z.string().min(1), entityId: z.string().min(1), snapshot: entitySchema }))
    .max(200000)
    .default([])
})
export function createAppClient(store: AtomicStore, builtins: Article[]) {
  const articlesFrom = (entities: Entity[]) =>
    [
      ...builtins,
      ...entities
        .filter((e) => e.kind === 'book')
        .map((e) => ({ ...e, volume: '导入书籍', isCore: false, coreOrder: null }))
    ] as Article[]
  async function validate(e: Entity, entities: Entity[]) {
    entitySchema.parse(e)
    if ('source' in e && e.source) validateSource(e.source, articlesFrom(entities))
    if (
      e.kind === 'action' &&
      e.readingId &&
      !entities.some((r) => r.id === e.readingId && r.kind === 'reading')
    )
      throw new Error('行动所属阅读不存在')
    if (e.kind === 'progress') {
      const article = articlesFrom(entities).find((a) => a.id === e.articleId)
      if (!article || e.paragraph >= paragraphs(article).length)
        throw new Error('阅读位置不在正文范围内')
    }
  }
  async function persist(input: Entity, allowActionTransition = false) {
    const snapshot = await store.snapshot()
    const prior = snapshot.entities.find((e) => e.id === input.id)
    if (prior && prior.kind !== input.kind) throw new Error('实体类型不可变更')
    if (input.kind === 'action' && !allowActionTransition) {
      if (
        prior?.kind === 'action'
          ? prior.planningState !== input.planningState || prior.status !== input.status
          : input.planningState !== 'candidate' || input.status !== 'todo'
      )
        throw new Error('行动状态只能由明确的行动命令改变')
    }
    const entity = entitySchema.parse({
      ...input,
      version: prior ? input.version + 1 : 1,
      updatedAt: new Date().toISOString()
    })
    await validate(entity, snapshot.entities)
    await store.commit({
      entity,
      expectedVersion: prior ? input.version : 0,
      operationId: crypto.randomUUID()
    })
    return entity
  }
  return {
    snapshot: () => store.snapshot(),
    articlesFrom,
    save: (input: Entity) => persist(input),
    async executeAction(input: Action, command: Parameters<typeof transition>[1]) {
      const prior = (await store.snapshot()).entities.find((e) => e.id === input.id)
      if (!prior || prior.kind !== 'action') throw new Error('请先保存候选行动')
      if (prior.planningState !== input.planningState || prior.status !== input.status)
        throw new Error('行动状态已改变，请重新打开')
      if (command === 'return') transition(prior, command)
      return persist(transition(input, command), true)
    },
    async importText(file: File) {
      if (file.size > 2_000_000) throw new Error('首版 TXT 导入限制为 2 MB')
      const content = (await file.text()).replace(/\r\n?/g, '\n').trim()
      if (!content || content.includes('\0') || content.includes('\ufffd'))
        throw new Error('请使用有效的 UTF-8 文本文件')
      const revisionId = await hash(content)
      const book = {
        ...newMeta(),
        kind: 'book' as const,
        title: file.name.replace(/\.txt$/i, '').slice(0, 200),
        content,
        revisionId
      }
      await this.save(book)
      return book.id
    },
    async exportBackup() {
      const { entities, history } = await store.snapshot()
      const payload = JSON.stringify({
        format: 'maoxuan-mobile',
        version: 1,
        exportedAt: new Date().toISOString(),
        entities,
        history
      })
      const text = JSON.stringify({ sha256: await hash(payload), payload }, null, 2)
      if (new TextEncoder().encode(text).length > 20_000_000)
        throw new Error(
          '当前开发版备份上限为 20 MB，数据未被修改；大数据备份需后续流式文件适配器。'
        )
      return text
    },
    async inspectBackup(text: string) {
      const envelope = z.object({ sha256: z.string(), payload: z.string() }).parse(JSON.parse(text))
      if ((await hash(envelope.payload)) !== envelope.sha256)
        throw new Error('备份校验失败，文件可能已损坏')
      const data = backupSchema.parse(JSON.parse(envelope.payload))
      if (new Set(data.entities.map((e) => e.id)).size !== data.entities.length)
        throw new Error('备份包含重复实体')
      for (const e of data.entities) {
        if (e.kind === 'book' && (await hash(e.content)) !== e.revisionId)
          throw new Error('书籍内容哈希不匹配')
        await validate(e, data.entities)
      }
      if (new Set(data.history.map((h) => h.id)).size !== data.history.length)
        throw new Error('历史版本 ID 重复')
      for (const h of data.history) {
        const current = data.entities.find((e) => e.id === h.entityId)
        if (
          !current ||
          h.snapshot.id !== h.entityId ||
          current.kind !== h.snapshot.kind ||
          h.snapshot.version > current.version
        )
          throw new Error('历史版本关联无效')
        await validate(h.snapshot, data.entities)
      }
      return data
    },
    async restoreBackup(text: string) {
      const { entities, history } = await this.inspectBackup(text)
      // Restoring local content starts a fresh reconciliation. Keep conflict copies, but
      // never reuse a baseline from the old dataset to overwrite another device.
      for (const e of entities)
        if (
          e.id.startsWith('desktop:sync:') &&
          e.kind === 'desktop' &&
          e.payload.type === 'settings'
        )
          e.payload.value = { ...e.payload.value, baseline: {}, lastSync: '' }
      await store.restore({ entities, history, outbox: [] } satisfies Snapshot)
    }
  }
}
export type AppClient = ReturnType<typeof createAppClient>
async function hash(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}
