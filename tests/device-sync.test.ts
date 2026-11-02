import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { request } from 'node:https'
import { openDatabase } from '../src/main/adapters/sqlite/database'
import { createSyncRepository } from '../src/main/adapters/sqlite/sync-repository'
import { createLanSync } from '../src/main/adapters/network/lan-sync'
import { canonical, reconcile, type SyncDocument } from '../src/shared/sync/protocol'
import 'fake-indexeddb/auto'
import { createBrowserStore } from '../apps/mobile/src/adapters/indexeddb'
import { exchangeSnapshot } from '../apps/mobile/src/application/sync'
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const note = (id: string, text: string): SyncDocument => ({
  kind: 'note',
  id,
  value: {
    id,
    title: id,
    markdown: text,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    completedAt: null,
    deleted: false,
    source: 'local',
    revision: 1,
    folderId: null,
    attachments: []
  }
})
it('SQLite PC and independent phone merge both directions, retain conflicts, resolve with CAS, and retry lost replies', async () => {
  const db = openDatabase(':memory:')
  try {
    const repo = createSyncRepository(db),
      store = await createBrowserStore(crypto.randomUUID())
    repo.transaction(() => repo.apply([note('pc', '电脑原文')]))
    const round = async (body: string) =>
      repo.transaction(() => {
        const reply = reconcile(repo.read(), JSON.parse(body), hash)
        repo.apply(reply.documents)
        reply.documents = repo.read()
        return JSON.stringify(reply)
      })
    await exchangeSnapshot(store, 'pc', round)
    const edit = async (text: string) => {
      const s = await store.snapshot()
      const entity = s.entities.find((e) => e.id === 'desktop:journal')!
      if (entity.kind !== 'desktop' || entity.payload.type !== 'journal') throw Error('journal')
      entity.payload.value.notes[0].markdown = text
      const v = entity.version
      entity.version++
      await store.commit({ entity, expectedVersion: v, operationId: crypto.randomUUID() })
    }
    await edit('手机更新')
    await exchangeSnapshot(store, 'pc', round)
    expect(repo.read().find((d) => d.id === 'pc')!.value).toMatchObject({ markdown: '手机更新' })
    await edit('手机并发')
    repo.transaction(() => repo.apply([note('pc', '电脑并发')]))
    const conflict = await exchangeSnapshot(store, 'pc', round)
    expect(conflict.conflicts).toHaveLength(1)
    expect(conflict.conflicts[0].local.value).toMatchObject({ markdown: '手机并发' })
    expect(conflict.conflicts[0].remote.value).toMatchObject({ markdown: '电脑并发' })
    await exchangeSnapshot(store, 'pc', round, { 'note:pc': 'local' })
    expect(repo.read().find((d) => d.id === 'pc')!.value).toMatchObject({ markdown: '手机并发' })
    await edit('回执中断')
    await expect(
      exchangeSnapshot(store, 'pc', async (body) => {
        await round(body)
        throw Error('断线')
      })
    ).rejects.toThrow('断线')
    expect((await exchangeSnapshot(store, 'pc', round)).conflicts).toHaveLength(0)
    expect(repo.read().filter((d) => d.kind === 'note')).toHaveLength(1)
    const before = await store.snapshot()
    await expect(
      store.batch([
        {
          entity: { ...before.entities[0], version: before.entities[0].version + 1 },
          expectedVersion: -1,
          operationId: crypto.randomUUID()
        }
      ])
    ).rejects.toThrow()
    expect(await store.snapshot()).toEqual(before)
  } finally {
    db.close()
  }
})
it('HTTPS requires the paired token, rejects malformed payload, and revokes endpoint on stop', async () => {
  const db = openDatabase(':memory:')
  const service = createLanSync(createSyncRepository(db), '127.0.0.1')
  try {
    const status = await service.start()
    const pair = JSON.parse(status.pairing[0])
    const post = (token: string, body: string) =>
      new Promise<{ code: number; body: string }>((ok, no) => {
        const req = request(
          pair.url,
          {
            method: 'POST',
            rejectUnauthorized: false,
            headers: { authorization: `Bearer ${token}` }
          },
          (res) => {
            let text = ''
            res.on('data', (c) => (text += c))
            res.on('end', () => ok({ code: res.statusCode!, body: text }))
          }
        )
        req.on('error', no)
        req.end(body)
      })
    expect((await post('wrong', '{}')).code).toBe(403)
    expect((await post(pair.token, '{}')).code).toBe(400)
    const result = await post(
      pair.token,
      JSON.stringify({ protocol: 1, changes: [{ document: note('new', 'HTTPS文本'), base: null }] })
    )
    expect(result.code).toBe(200)
    expect(JSON.parse(result.body).documents).toHaveLength(1)
    await service.stop()
    await expect(post(pair.token, '{}')).rejects.toThrow()
  } finally {
    await service.stop()
    db.close()
  }
})

it('session histories, standalone todos, different notes and soft-delete conflicts use stable identities', async () => {
  const { emptySessionData } = await import('../src/shared/types')
  const db = openDatabase(':memory:')
  try {
    const repo = createSyncRepository(db)
    const store = await createBrowserStore(crypto.randomUUID())
    const data = emptySessionData()
    data.problem.text = '带着问题读原文'
    const s: import('../src/shared/types').Session = {
      id: 'session-sync',
      title: '实际问题',
      mode: 'reading',
      currentStep: 'problem',
      status: 'active',
      deletedAt: null,
      stateVersion: 1,
      versionNo: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      data
    }
    const docs: SyncDocument[] = [
      {
        id: s.id,
        kind: 'session',
        value: {
          session: s,
          versions: [
            {
              id: 'version-sync',
              sessionId: s.id,
              versionNo: 1,
              step: 'problem',
              label: '初始问题',
              data,
              createdAt: s.createdAt
            }
          ],
          messages: []
        }
      },
      {
        id: 'action-sync',
        kind: 'action',
        value: {
          id: 'action-sync',
          text: '先调查实际情况',
          fromArticleId: null,
          dueDate: '',
          status: 'todo',
          result: '',
          progress: [],
          createdAt: s.createdAt
        }
      },
      note('A', 'A原文'),
      note('B', 'B原文')
    ]
    repo.transaction(() => repo.apply(docs))
    const round = async (body: string) =>
      repo.transaction(() => {
        const reply = reconcile(repo.read(), JSON.parse(body), hash)
        repo.apply(reply.documents)
        reply.documents = repo.read()
        return JSON.stringify(reply)
      })
    await exchangeSnapshot(store, 'pc', round)
    await exchangeSnapshot(store, 'pc', round)
    expect(repo.read().filter((d) => d.kind === 'session')).toHaveLength(1)
    expect(repo.read().find((d) => d.kind === 'session')!.value).toMatchObject({
      versions: [{ id: 'version-sync' }]
    })
    const snapshot = await store.snapshot()
    const entity = snapshot.entities.find((e) => e.id === 'desktop:journal')!
    if (entity.kind !== 'desktop' || entity.payload.type !== 'journal') throw Error('journal')
    entity.payload.value.notes.find((n) => n.id === 'A')!.markdown = '手机编辑A'
    const v = entity.version
    entity.version++
    await store.commit({ entity, expectedVersion: v, operationId: crypto.randomUUID() })
    repo.transaction(() => repo.apply([note('B', '电脑编辑B')]))
    expect((await exchangeSnapshot(store, 'pc', round)).conflicts).toHaveLength(0)
    const merged = repo.read()
    expect(merged.find((d) => d.id === 'A')!.value).toMatchObject({ markdown: '手机编辑A' })
    expect(merged.find((d) => d.id === 'B')!.value).toMatchObject({ markdown: '电脑编辑B' })
    const local = await store.snapshot()
    const journal = local.entities.find((e) => e.id === 'desktop:journal')!
    if (journal.kind !== 'desktop' || journal.payload.type !== 'journal') throw Error('journal')
    journal.payload.value.notes.find((n) => n.id === 'A')!.deleted = true
    const version = journal.version
    journal.version++
    await store.commit({
      entity: journal,
      expectedVersion: version,
      operationId: crypto.randomUUID()
    })
    repo.transaction(() => repo.apply([note('A', '电脑同时编辑')]))
    expect((await exchangeSnapshot(store, 'pc', round)).conflicts).toHaveLength(1)
    expect(
      (await exchangeSnapshot(store, 'pc', round, { 'note:A': 'remote' })).conflicts
    ).toHaveLength(0)
  } finally {
    db.close()
  }
})
