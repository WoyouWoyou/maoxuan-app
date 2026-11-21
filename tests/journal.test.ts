import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/adapters/sqlite/database'
import { createJournalRepository } from '../src/main/adapters/sqlite/journal-repository'
import { createJournalService, type JournalAssets } from '../src/main/modules/journal/public'
import { createMarchRepository } from '../src/main/adapters/sqlite/long-march-repository'
import { createMarchService } from '../src/main/modules/long-march/public'
import { validateIpcArguments } from '../src/shared/contracts/ipc'
let db: Database.Database
let service: ReturnType<typeof createJournalService>
let march: ReturnType<typeof createMarchService>
let assets: JournalAssets
beforeEach(() => {
  db = openDatabase(':memory:')
  const media = new Map<string, Uint8Array>()
  assets = {
    put: (id, data) => {
      media.set(id, data)
    },
    get: (id) => {
      const b = media.get(id)
      if (!b) throw new Error('missing')
      return b
    },
    remove: (id) => {
      media.delete(id)
    }
  }
  march = createMarchService(createMarchRepository(db))
  service = createJournalService(createJournalRepository(db), assets, (id, createdAt) =>
    march.observe([{ id: `journal:${id}:completed`, kind: 'journal', createdAt }])
  )
})
afterEach(() => db.close())
function folder(name: string, parentId: string | null = null) {
  const r = service.apply({ kind: 'folderCreate', name, parentId })
  return r.state.folders.at(-1)!
}
function note(folderId: string | null = null) {
  const r = service.apply({ kind: 'noteCreate', folderId })
  return r.state.notes.find((n) => n.id === r.selectedId)!
}
function save(id: string, markdown = '今天学会了先倾听') {
  const n = service.read().notes.find((n) => n.id === id)!
  return service.apply({
    kind: 'noteSave',
    id,
    revision: n.revision,
    title: '复盘',
    markdown,
    tags: ['工作']
  })
}
describe('Journal domain with SQLite and growth ledger', () => {
  it('creates nested folders, prevents cycles and same-parent duplicates while allowing projects in different years', () => {
    const a = folder('2026'),
      b = folder('2025'),
      p = folder('项目A', a.id)
    folder('项目A', b.id)
    expect(() => folder(' 项目A ', a.id)).toThrow('同名')
    expect(() =>
      service.apply({ kind: 'folderEdit', id: a.id, name: a.name, parentId: p.id })
    ).toThrow('子文件夹')
    expect(() => folder('../escape')).toThrow('名称')
    expect(service.read().folders).toHaveLength(4)
  })
  it('awards one persisted journal fact only; edits, moves, trash/restore and restart never award twice', () => {
    const f = folder('2026')
    const n = note()
    expect(save(n.id).earned).toBe(true)
    expect(service.apply({ kind: 'noteComplete', id: n.id }).earned).toBe(false)
    save(n.id, '修改记录')
    service.apply({ kind: 'noteMove', ids: [n.id], folderId: f.id })
    service.apply({ kind: 'noteDelete', id: n.id, value: true })
    service.apply({ kind: 'noteDelete', id: n.id, value: false })
    expect(service.apply({ kind: 'noteComplete', id: n.id }).earned).toBe(false)
    expect(march.getProgress()).toMatchObject({ balance: 10, counts: { journal: 1 } })
    expect(createJournalRepository(db).read().notes[0].completedAt).toBeTruthy()
    march.plant('yudu', 'journal-tree')
    expect(march.getProgress().balance).toBe(0)
  })
  it('rejects empty completion and stale revisions; preserves committed text', () => {
    const n = note()
    save(n.id, '# ** **\n- [ ] ')
    expect(() => service.apply({ kind: 'noteComplete', id: n.id })).toThrow('文字')
    expect(() =>
      service.apply({
        kind: 'noteSave',
        id: n.id,
        revision: 0,
        title: '',
        markdown: 'stale',
        tags: []
      })
    ).toThrow('其他窗口')
    expect(service.read().notes[0].markdown).toContain('#')
    expect(march.getProgress().earned).toBe(0)
  })
  it('makes archived/deleted parent subtrees read-only and restores the full hierarchy', () => {
    const f = folder('2026')
    const project = folder('项目', f.id)
    const n = note(project.id)
    save(n.id)
    service.apply({ kind: 'folderArchive', id: f.id, value: true })
    expect(() => save(n.id)).toThrow('恢复文件夹')
    expect(() => note(project.id)).toThrow('恢复文件夹')
    service.apply({ kind: 'folderArchive', id: f.id, value: false })
    service.apply({ kind: 'folderDelete', id: f.id, value: true })
    expect(() => service.apply({ kind: 'folderDelete', id: project.id, value: false })).toThrow(
      '恢复文件夹'
    )
    service.apply({ kind: 'folderDelete', id: f.id, value: false })
    save(n.id)
    expect(service.read().notes[0].folderId).toBe(project.id)
  })
  it('accepts audio-only records, rejects mismatched bytes, retains files in trash and removes files on purge', () => {
    const n = note()
    const data = new Uint8Array(100)
    data.set([0x1a, 0x45, 0xdf, 0xa3])
    expect(() => service.attach(n.id, 'bad', 'audio/webm', new Uint8Array(100))).toThrow('不匹配')
    const a = service.attach(n.id, '录音', 'audio/webm', data)
    service.apply({ kind: 'noteComplete', id: n.id })
    expect(march.getProgress().balance).toBe(10)
    service.apply({ kind: 'noteDelete', id: n.id, value: true })
    expect(service.media(a.id).bytes).toEqual(data)
    service.apply({ kind: 'notePurge', id: n.id })
    expect(() => assets.get(a.id)).toThrow('missing')
    expect(march.getProgress().balance).toBe(10)
  })
  it('rolls back completion and growth together when reward persistence fails', () => {
    const n = note()
    const failing = createJournalService(createJournalRepository(db), assets, () => {
      throw new Error('账本失败')
    })
    expect(() =>
      failing.apply({
        kind: 'noteSave',
        id: n.id,
        revision: n.revision,
        title: '复盘',
        markdown: '今天学会了先倾听',
        tags: []
      })
    ).toThrow('账本失败')
    expect(service.read().notes[0].markdown).toBe('')
    expect(service.read().notes[0].revision).toBe(n.revision)
    expect(service.read().notes[0].completedAt).toBeNull()
    expect(march.getProgress().earned).toBe(0)
  })
  it('deduplicates reimports including folders and excludes all imports from rewards', () => {
    const f = folder('2026')
    const n = note(f.id)
    save(n.id)
    const backup = service.read()
    const earnedBeforeImport = march.getProgress().earned
    // Simulate backup coming from another installation.
    db.prepare('UPDATE journal_state SET data=?').run(JSON.stringify({ folders: [], notes: [] }))
    expect(service.importRecords(backup, {}, null)).toBe(1)
    expect(service.importRecords(backup, {}, null)).toBe(0)
    expect(service.read().folders).toHaveLength(1)
    const imported = service.read().notes[0]
    expect(save(imported.id, '导入后修改内容').earned).toBe(false)
    service.apply({ kind: 'noteComplete', id: imported.id })
    expect(march.getProgress().earned).toBe(earnedBeforeImport)
  })
  it('validates IPC commands and forbids renderer-provided reward amounts', () => {
    expect(() =>
      validateIpcArguments('journal:apply', [{ kind: 'noteComplete', id: 'a', points: 999 }])
    ).toThrow()
    expect(() =>
      validateIpcArguments('journal:apply', [
        { kind: 'folderCreate', name: '2026', parentId: null }
      ])
    ).not.toThrow()
  })
})

it('creates independent template drafts in the selected folder and only awards after filling them', () => {
  const f = folder('2026')
  const r = service.apply({
    kind: 'noteCreate',
    folderId: f.id,
    templateId: 'builtin-management-review'
  })
  const n = r.state.notes.find((n) => n.id === r.selectedId)!
  expect(n.markdown).toContain('## ⑦ 一句话结论（沉淀认知）')
  expect(n.folderId).toBe(f.id)
  expect(n.completedAt).toBeNull()
  expect(() => service.apply({ kind: 'noteComplete', id: n.id })).toThrow('填写模板')
  expect(save(n.id, n.markdown).earned).toBe(false)
  expect(march.getProgress().earned).toBe(0)
  expect(save(n.id, n.markdown + '\n今天真正学到的是先听清事实。').earned).toBe(true)
  service.apply({ kind: 'noteComplete', id: n.id })
  expect(march.getProgress().balance).toBe(10)
  const second = service.apply({
    kind: 'noteCreate',
    folderId: f.id,
    templateId: 'builtin-management-review'
  })
  expect(second.selectedId).not.toBe(n.id)
  expect(second.state.notes.at(-1)!.markdown).not.toContain('今天真正学到的是先听清事实。')
})
it('persists reusable custom Markdown templates and deletes templates without affecting created records', () => {
  const n = note()
  save(n.id, '# 自用模板\n\n## 目标\n\n- 我的目标：')
  const r = service.apply({ kind: 'templateSave', name: '我的周记', noteId: n.id })
  const template = r.state.templates![0]
  expect(createJournalRepository(db).read().templates![0].markdown).toContain('我的目标')
  const created = service.apply({ kind: 'noteCreate', folderId: null, templateId: template.id })
  expect(created.state.notes.at(-1)!.markdown).toBe(template.markdown)
  service.apply({ kind: 'templateDelete', id: template.id })
  expect(service.read().templates).toHaveLength(0)
  expect(service.read().notes).toHaveLength(2)
  expect(() =>
    service.apply({ kind: 'noteCreate', folderId: null, templateId: template.id })
  ).toThrow('模板不存在')
})
