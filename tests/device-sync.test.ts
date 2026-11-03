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
it('SQLite PC and independent phone merge both directions, retain editable conflict copies with CAS, and retry lost replies', async () => {
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
    expect((await exchangeSnapshot(store, 'pc', round)).conflicts).toHaveLength(0)
    expect(repo.read().find((d) => d.id === 'pc')!.value).toMatchObject({ markdown: '电脑并发' })
    expect(repo.read().find((d) => d.id.startsWith('sync-conflict:'))!.value).toMatchObject({
      markdown: '手机并发'
    })
    await edit('回执中断')
    await expect(
      exchangeSnapshot(store, 'pc', async (body) => {
        await round(body)
        throw Error('断线')
      })
    ).rejects.toThrow('断线')
    expect((await exchangeSnapshot(store, 'pc', round)).conflicts).toHaveLength(0)
    expect(repo.read().filter((d) => d.kind === 'note')).toHaveLength(2)
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
      JSON.stringify({ protocol: 2, changes: [{ document: note('new', 'HTTPS文本'), base: null }] })
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
    expect((await exchangeSnapshot(store, 'pc', round)).conflicts).toHaveLength(0)
    expect(
      repo
        .read()
        .some((d) => d.kind === 'note' && d.id.startsWith('sync-conflict:') && d.value.deleted)
    ).toBe(true)
  } finally {
    db.close()
  }
})

it('conflicting session branches preserve both histories with independent local version numbers', async () => {
  const { emptySessionData } = await import('../src/shared/types')
  const db = openDatabase(':memory:')
  try {
    const repo = createSyncRepository(db)
    const base = emptySessionData()
    base.problem.text = '共同起点'
    const session: import('../src/shared/types').Session = {
      id: 'branches',
      title: '同一问题',
      mode: 'reading',
      currentStep: 'problem',
      status: 'active',
      deletedAt: null,
      stateVersion: 1,
      versionNo: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      data: base
    }
    const initial: SyncDocument = {
      kind: 'session',
      id: session.id,
      value: {
        session,
        versions: [
          {
            id: 'v1',
            sessionId: session.id,
            versionNo: 1,
            step: 'problem',
            label: '起点',
            data: structuredClone(base),
            createdAt: session.createdAt
          }
        ],
        messages: []
      }
    }
    repo.transaction(() => repo.apply([initial]))
    const common = repo.read()[0]
    const branch = (id: string): SyncDocument => {
      const d = structuredClone(initial)
      if (d.kind !== 'session') throw Error()
      d.value.session.data.problem.text = id
      d.value.session.versionNo = 2
      d.value.versions.push({
        id,
        sessionId: session.id,
        versionNo: 2,
        step: 'problem',
        label: id,
        data: structuredClone(d.value.session.data),
        createdAt: session.createdAt
      })
      return d
    }
    const pc = branch('pc-v2'),
      phone = branch('phone-v2')
    repo.transaction(() => repo.apply([pc]))
    expect(
      reconcile(
        repo.read(),
        { protocol: 2, changes: [{ document: phone, base: hash(common) }] },
        hash
      ).conflicts
    ).toHaveLength(1)
    const reply = reconcile(
      repo.read(),
      { protocol: 2, changes: [{ document: phone, base: hash(common) }] },
      hash
    )
    repo.transaction(() => repo.apply(reply.documents))
    const result = repo.read().filter((d) => d.kind === 'session')
    expect(result).toHaveLength(2)
    expect(result.find((d) => d.id === 'branches')!.value).toMatchObject({
      session: { data: { problem: { text: 'pc-v2' } } }
    })
    const copy = result.find((d) => d.id.startsWith('sync-conflict:'))!
    expect(copy.value).toMatchObject({ session: { data: { problem: { text: 'phone-v2' } } } })
    if (copy.kind !== 'session') throw Error()
    expect(copy.value.versions).toHaveLength(2)
    expect(
      copy.value.versions.every((v) => v.sessionId === copy.id && v.id.startsWith('sync-conflict:'))
    ).toBe(true)
    const retry = reconcile(
      repo.read(),
      { protocol: 2, changes: [{ document: phone, base: hash(common) }] },
      hash
    )
    expect(retry.documents.map((d) => d.id).sort()).toEqual(result.map((d) => d.id).sort())
  } finally {
    db.close()
  }
})

it('folder and todo conflicts create stable editable copies without overwriting either input', () => {
  const db = openDatabase(':memory:')
  try {
    const repo = createSyncRepository(db)
    const folder: SyncDocument = {
      kind: 'folder',
      id: 'folder',
      value: { id: 'folder', name: '电脑目录', parentId: null, archived: false, deleted: false }
    }
    const action: SyncDocument = {
      kind: 'action',
      id: 'todo',
      value: {
        id: 'todo',
        text: '电脑待办',
        status: 'todo',
        progress: [],
        result: '',
        fromArticleId: null,
        dueDate: '',
        createdAt: '2026-01-01T00:00:00Z'
      }
    }
    repo.transaction(() => repo.apply([folder, action]))
    const phoneFolder = structuredClone(folder)
    phoneFolder.value.name = '手机目录'
    const phoneAction = structuredClone(action)
    phoneAction.value.text = '手机待办'
    const request = {
      protocol: 2 as const,
      changes: [
        { document: phoneFolder, base: null },
        { document: phoneAction, base: null }
      ]
    }
    const reply = reconcile(repo.read(), request, hash)
    repo.transaction(() => repo.apply(reply.documents))
    expect(repo.read()).toHaveLength(4)
    expect(repo.read().find((d) => d.kind === 'folder' && d.id === 'folder')!.value).toMatchObject({
      name: '电脑目录'
    })
    expect(repo.read().find((d) => d.kind === 'action' && d.id === 'todo')!.value).toMatchObject({
      text: '电脑待办'
    })
    expect(
      repo.read().some((d) => d.kind === 'folder' && d.value.name === '手机目录（同步冲突副本）')
    ).toBe(true)
    expect(
      repo.read().some((d) => d.kind === 'action' && d.value.text === '手机待办（同步冲突副本）')
    ).toBe(true)
    expect(
      reconcile(repo.read(), request, hash)
        .documents.map((d) => d.id)
        .sort()
    ).toEqual(reply.documents.map((d) => d.id).sort())
  } finally {
    db.close()
  }
})

it('syncs image/audio notes in both directions, keeps text on interrupted media, and retries missing chunks', async () => {
  const { CHUNK_BYTES } = await import('../src/shared/sync/assets')
  const { createDesktopApi } = await import('../apps/mobile/src/application/desktop-api')
  const db = openDatabase(':memory:')
  try {
    const files = new Map<string, Uint8Array>()
    const assets = {
      put: (id: string, bytes: Uint8Array) => {
        files.set(id, new Uint8Array(bytes))
      },
      get: (id: string) => {
        const bytes = files.get(id)
        if (!bytes) throw Error('missing')
        return bytes
      },
      remove: (id: string) => {
        files.delete(id)
      }
    }
    const repo = createSyncRepository(db, assets),
      store = await createBrowserStore(crypto.randomUUID())
    const imageId = crypto.randomUUID(),
      audioId = crypto.randomUUID()
    const image = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64'
      )
    )
    const audio = new Uint8Array(CHUNK_BYTES + 128)
    audio.set(new TextEncoder().encode('RIFF'))
    audio.set(new TextEncoder().encode('WAVE'), 8)
    files.set(imageId, image)
    files.set(audioId, audio)
    const source = note('with-media', '图片与录音的正文都不能丢')
    if (source.kind !== 'note') throw Error()
    source.value.attachments = [
      { id: imageId, name: '照片.png', mime: 'image/png', size: image.length },
      { id: audioId, name: '录音.wav', mime: 'audio/wav', size: audio.length }
    ]
    repo.transaction(() => repo.apply([source]))
    let fail = true
    const round = async (body: string) => {
      const input = JSON.parse(body)
      if (input.operation) {
        if (fail && input.id === audioId && input.offset >= CHUNK_BYTES) throw Error('中途断线')
        return JSON.stringify(repo.asset!(input))
      }
      return repo.transaction(() => {
        const reply = reconcile(repo.read(), input, hash)
        repo.apply(reply.documents)
        reply.documents = repo.read()
        return JSON.stringify(reply)
      })
    }
    // A conflicting file identity must never replace an existing binary, even with a different size.
    expect(() =>
      repo.asset!({
        operation: 'asset-write',
        id: imageId,
        offset: 0,
        total: image.length,
        sha256: '0'.repeat(64),
        data: Buffer.from(image).toString('base64')
      })
    ).toThrow('身份冲突')
    expect(files.get(imageId)).toEqual(image)
    const first = await exchangeSnapshot(store, 'media-pc', round)
    expect(first.attachments?.pending).toBe(1)
    let phone = await createDesktopApi(store, [])
    let notes = await phone.api.journal.list()
    expect(notes.notes[0].markdown).toBe('图片与录音的正文都不能丢')
    expect(notes.notes[0].attachments).toHaveLength(2)
    expect((await phone.api.journal.media(imageId)).bytes).toEqual(image)
    await expect(phone.api.journal.media(audioId)).rejects.toThrow('附件尚未同步')
    fail = false
    expect((await exchangeSnapshot(store, 'media-pc', round)).attachments?.pending).toBe(0)
    await phone.refresh()
    expect((await phone.api.journal.media(audioId)).bytes).toEqual(audio)
    notes = await phone.api.journal.list()
    await phone.api.journal.apply({
      kind: 'noteSave',
      id: source.id,
      revision: notes.notes[0].revision,
      title: '手机编辑',
      markdown: '手机修改后仍保留照片录音',
      tags: []
    })
    const added = await phone.api.journal.attach(source.id, '手机上传.wav', 'audio/wav', audio)
    expect((await exchangeSnapshot(store, 'media-pc', round)).attachments?.pending).toBe(0)
    expect(files.get(added.id)).toEqual(audio)
    expect(repo.read().find((d) => d.id === source.id)!.value).toMatchObject({
      markdown: '手机修改后仍保留照片录音'
    })
    expect(repo.read().filter((d) => d.kind === 'note')).toHaveLength(1)
  } finally {
    db.close()
  }
})
