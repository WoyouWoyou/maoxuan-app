import { beforeEach, describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/main/adapters/sqlite/migrations'
import { createLibraryRepository } from '../src/main/adapters/sqlite/library-repository'
import { createUsageRepository } from '../src/main/adapters/sqlite/usage-repository'
import { createTaskRepository } from '../src/main/adapters/sqlite/task-repository'
import { configureTasks, startTask, cancelTask, getTask } from '../src/main/modules/tasks/public'
let db: Database.Database
function oldSchema() {
  db.exec(
    `CREATE TABLE sessions(id TEXT PRIMARY KEY);CREATE TABLE articles(id TEXT PRIMARY KEY,title TEXT,volume TEXT,is_core INTEGER,core_order INTEGER,content TEXT,ord INTEGER);CREATE VIRTUAL TABLE articles_fts USING fts5(title,content,content='articles',content_rowid='rowid',tokenize='trigram');`
  )
}
beforeEach(() => {
  db?.close()
  db = new Database(':memory:')
  db.pragma('foreign_keys=ON')
  oldSchema()
  migrate(db)
})
const builtin = [
  {
    id: 'Section0215',
    title: '实践论',
    volume: '第二卷',
    content: '原来第一段。\n原来第二段。',
    isCore: true,
    coreOrder: 0
  }
]
const parsed = {
  title: '其他书',
  author: '作者',
  format: 'txt' as const,
  hash: 'hash-1',
  encoding: 'utf-8',
  chapters: [
    { title: '第一章', path: '正文', content: '新书第一段。\n新书第二段。', source: 'txt:0' }
  ],
  warnings: []
}
describe('immutable library migration', () => {
  it('migrates only once and retains old source text and IDs', () => {
    db.prepare('INSERT INTO articles VALUES(?,?,?,?,?,?,?,?,?,?)').run(
      'Section0215',
      '实践论',
      '第二卷',
      1,
      0,
      '原来第一段。\n原来第二段。',
      0,
      'maoxuan',
      'maoxuan-v1',
      ''
    )
    const repo = createLibraryRepository(db)
    repo.syncBuiltin(builtin)
    migrate(db)
    expect(repo.getChapter('Section0215')?.paragraphIds).toEqual([
      'Section0215:p0',
      'Section0215:p1'
    ])
    expect(repo.getChapter('Section0215')?.paragraphs[1]).toBe('原来第二段。')
  })
  it('deduplicates, scopes all reads and survives builtin synchronization', () => {
    const repo = createLibraryRepository(db)
    repo.syncBuiltin(builtin)
    const book = repo.importBook(parsed, '其他书', '作者')
    expect(repo.importBook(parsed, '重名', '')?.bookId).toBe(book.bookId)
    repo.syncBuiltin(builtin)
    expect(repo.listBooks()).toHaveLength(2)
    const chapter = repo.listChapters(book)[0]
    expect(() => repo.getChapter(chapter.id, repo.requireBook())).toThrow('不属于')
    expect(repo.searchChapters('新书', 10, repo.requireBook())).toHaveLength(0)
    repo.hideBook(book.bookId, true)
    expect(repo.listBooks()).toHaveLength(1)
    expect(repo.getChapter(chapter.id, book)).not.toBeNull()
    expect(() => repo.syncBuiltin([{ ...builtin[0], content: '改变旧段落' }])).toThrow('迁移')
  })
  it('retains accounting without session foreign key and aggregates unknown separately', () => {
    const usage = createUsageRepository(db)
    usage.beginCall('a', { purpose: 'chat', sessionId: 'deleted' }, 'm', 'local')
    usage.finishCall(
      'a',
      'failed',
      { input: 1, output: null, total: null, source: 'unknown', completeness: 'partial' },
      10
    )
    usage.finishCall(
      'a',
      'failed',
      { input: 2, output: null, total: null, source: 'unknown', completeness: 'partial' },
      20
    )
    expect(usage.queryUsage()).toMatchObject({ calls: 1, total: 0, unknown: 1 })
  })
  it('cancels tasks, releases queue slots, identifies interrupted runs', async () => {
    configureTasks(createTaskRepository(db))
    const a = startTask('index', 'book', async (signal) => {
      await new Promise<void>((resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('cancel')), { once: true })
      )
      return 'x'
    })
    expect(startTask('index', 'book', async () => 'duplicate').id).toBe(a.id)
    await new Promise((r) => setTimeout(r, 10))
    cancelTask(a.id)
    await new Promise((r) => setTimeout(r, 20))
    expect(getTask(a.id).status).toBe('cancelled')
    const b = startTask('index', 'next', async () => 'done')
    await new Promise((r) => setTimeout(r, 20))
    expect(getTask(b.id).status).toBe('succeeded')
    const repo = createTaskRepository(db)
    repo.create({ ...b, id: 'interrupted', status: 'running' })
    repo.recover()
    expect(repo.get('interrupted').status).toBe('interrupted')
  })
})

describe('migration failure and model configuration', () => {
  it('rolls back failed schema migrations instead of marking success', () => {
    const broken = new Database(':memory:')
    broken.exec(
      'CREATE TABLE sessions(id TEXT);CREATE TABLE articles(id TEXT);CREATE TABLE books(id TEXT)'
    )
    expect(() => migrate(broken)).toThrow()
    expect(broken.pragma('user_version', { simple: true })).toBe(0)
    expect(
      (broken.pragma('table_info(sessions)') as any[]).some((c) => c.name === 'state_version')
    ).toBe(false)
    broken.close()
  })
})
