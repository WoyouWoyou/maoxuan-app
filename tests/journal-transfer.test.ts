import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import type { JournalState, JournalCommand } from '../src/shared/journal'
import { configureJournal, journalService } from '../src/main/modules/journal/public'
const fake = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  save: '',
  open: [] as string[],
  confirm: 0
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => fake.handlers.set(name, handler)
  },
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: fake.save }),
    showOpenDialog: async () => ({ canceled: false, filePaths: fake.open }),
    showMessageBox: async () => ({ response: fake.confirm })
  }
}))
import { registerJournalHandlers } from '../src/main/adapters/electron/journal-handlers'
let root: string
function fresh(allowLocalRewards = false) {
  let state: JournalState = { folders: [], notes: [] }
  const assets = new Map<string, Uint8Array>()
  configureJournal(
    {
      read: () => structuredClone(state),
      write: (s) => {
        state = structuredClone(s)
      },
      transaction: (work) => work()
    },
    {
      put: (id, bytes) => {
        assets.set(id, bytes)
      },
      get: (id) => {
        const data = assets.get(id)
        if (!data) throw new Error('missing')
        return data
      },
      remove: (id) => {
        assets.delete(id)
      }
    },
    () => {
      if (allowLocalRewards) return true
      throw new Error('Imports must not earn points')
    }
  )
}
const call = (name: string, ...args: unknown[]) =>
  fake.handlers.get(`journal:${name}`)!(null, ...args)
const apply = (command: JournalCommand) => journalService().apply(command)
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'journal-transfer-'))
  fake.save = join(root, 'backup.zip')
  fake.open = []
  fake.confirm = 0
  fresh(true)
  registerJournalHandlers()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
it('exports nested Markdown and playable attachment filenames and restores the complete backup without rewards or duplicate folders', async () => {
  let r = apply({ kind: 'folderCreate', name: '2026', parentId: null })
  const year = r.state.folders[0].id
  r = apply({ kind: 'folderCreate', name: '项目A', parentId: year })
  const project = r.state.folders[1].id
  r = apply({ kind: 'noteCreate', folderId: project })
  const id = r.selectedId!
  apply({ kind: 'noteSave', id, revision: 0, title: '一篇记录', markdown: '正文', tags: ['复盘'] })
  const bytes = new Uint8Array(100)
  bytes.set([0x1a, 0x45, 0xdf, 0xa3])
  journalService().attach(id, '语音', 'audio/webm', bytes)
  apply({ kind: 'folderArchive', id: year, value: true })
  const result = await call('export', year)
  expect(result.count).toBe(1)
  const files = unzipSync(readFileSync(fake.save))
  const md = Object.keys(files).find((p) => p.endsWith('.md'))!
  expect(md).toMatch(/^2026-.*\/项目A-/)
  expect(strFromU8(files[md])).toContain('../../assets/')
  expect(Object.keys(files).some((p) => p.endsWith('.webm'))).toBe(true)
  fresh()
  fake.open = [fake.save]
  expect((await call('import', null)).count).toBe(1)
  expect(
    journalService()
      .read()
      .folders.some((f) => f.archived)
  ).toBe(true)
  const note = journalService().read().notes[0]
  expect(note.tags).toEqual(['复盘'])
  expect(journalService().media(note.attachments[0].id).bytes).toEqual(bytes)
  expect((await call('import', null)).count).toBe(0)
  expect(journalService().read().folders).toHaveLength(2)
})
it('previews plain Markdown import, supports cancellation and deduplicates repeated files', async () => {
  const file = join(root, '随手记.md')
  writeFileSync(file, '# 今天\n记录一点收获')
  fake.open = [file]
  fake.confirm = 1
  expect((await call('import', null)).cancelled).toBe(true)
  expect(journalService().read().notes).toHaveLength(0)
  fake.confirm = 0
  await call('import', null)
  await call('import', null)
  expect(journalService().read().notes).toHaveLength(1)
  expect(journalService().read().notes[0].source).toBe('import')
})
it('rejects zip traversal paths and missing attachment packages before writing records', async () => {
  const file = join(root, 'bad.zip')
  writeFileSync(file, zipSync({ '../escape': strToU8('bad') }))
  fake.open = [file]
  await expect(call('import', null)).rejects.toThrow('路径')
  expect(journalService().read().notes).toHaveLength(0)
})

it('exports a single text note as ordinary Markdown', async () => {
  const r = apply({ kind: 'noteCreate', folderId: null })
  const id = r.selectedId!
  apply({ kind: 'noteSave', id, revision: 0, title: '随手记', markdown: '正文内容', tags: [] })
  fake.save = join(root, 'note.md')
  expect((await call('export', null, id)).count).toBe(1)
  expect(readFileSync(fake.save, 'utf8')).toBe('# 随手记\n\n正文内容')
})
