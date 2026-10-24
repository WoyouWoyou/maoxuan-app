import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '../src/main/adapters/sqlite/database'
import { createActionRepository } from '../src/main/adapters/sqlite/action-repository'
import {
  configureActions,
  createAction,
  editAction,
  listActions
} from '../src/main/modules/action-planning/public'
import { standaloneAction } from '../src/shared/actions'
import { validateIpcArguments } from '../src/shared/contracts/ipc'

let db: Database.Database | undefined
let directory: string | undefined
afterEach(() => {
  db?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})
describe('default source actions', () => {
  it('adds without a problem or book and preserves edits, progress and completion after reopening', () => {
    directory = mkdtempSync(join(tmpdir(), 'maoxuan-actions-'))
    const file = join(directory, 'actions.db')
    db = openDatabase(file)
    configureActions(createActionRepository(db))
    const task = createAction({ text: '  完成本职工作  ', dueDate: '2026-10-25' })
    editAction(task.id, { quadrant: 'do', purpose: '交付', verify: '评审通过' }, '已完成初稿')
    const done = editAction(task.id, { status: 'done', text: '提交工作报告' })
    expect(done.progress).toHaveLength(1)
    expect(db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 })
    db.close()
    db = openDatabase(file)
    configureActions(createActionRepository(db))
    expect(listActions()).toEqual([done])
    expect(standaloneAction(done)).toMatchObject({
      mode: 'default',
      sessionId: '',
      quadrant: 'do',
      status: 'done',
      text: '提交工作报告',
      purpose: '交付',
      verify: '评审通过',
      dueDate: '2026-10-25'
    })
    expect(editAction(task.id, { status: 'todo', quadrant: null }).quadrant).toBeNull()
  })
  it('validates edits and never creates blank tasks or silently recreates missing tasks', () => {
    db = openDatabase(':memory:')
    configureActions(createActionRepository(db))
    expect(() => createAction({ text: ' ' })).toThrow('任务名称')
    expect(() => editAction('missing', { status: 'done' })).toThrow('删除')
    const task = createAction({ text: '临时任务' })
    expect(() => editAction(task.id, { text: ' ' })).toThrow('不能为空')
    expect(() => validateIpcArguments('actions:edit', [task.id, { quadrant: 'wrong' }])).toThrow(
      '格式'
    )
    expect(() =>
      validateIpcArguments('actions:create', [{ text: '任务', sessionId: 'wrong' }])
    ).toThrow('格式')
    expect(listActions()).toEqual([task])
  })
})
