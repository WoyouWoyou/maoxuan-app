import { describe, it, expect } from 'vitest'
import { emptySessionData } from '../src/shared/types'
import { readingCommands } from '../src/shared/contracts/reading'
import { applyReadingCommands } from '../src/main/modules/reading/public'
import { createModelConfigRepository } from '../src/main/adapters/sqlite/model-config-repository'
import Database from 'better-sqlite3'
describe('reading commands', () => {
  it('updates only changed state and rejects stale application', () => {
    const before = emptySessionData(),
      after = {
        ...before,
        problem: { text: '明确描述需要解决的问题', background: '背景', tried: '' }
      }
    const commands = readingCommands(before, after)
    expect(commands).toHaveLength(1)
    expect(applyReadingCommands(before, commands)).toEqual(after)
    expect(() => applyReadingCommands(before, [{ kind: 'book', value: 'x' } as any])).toThrow(
      '格式'
    )
  })
  it('keeps named credentials out of public config and snapshots model choice', () => {
    const db = new Database(':memory:')
    db.exec(
      'CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE model_profiles(id TEXT PRIMARY KEY,name TEXT,config TEXT,secret TEXT,active INTEGER)'
    )
    const repo = createModelConfigRepository(db, {
      encrypt: (v) => 'encrypted:' + v,
      decrypt: (v) => v.slice(10)
    })
    const p = repo.save(undefined, '测试', {
      apiKey: 'secret',
      baseUrl: 'https://example.invalid/v1',
      model: 'model-a'
    })
    expect(JSON.stringify(p)).not.toContain('secret')
    repo.select(p.id)
    const active = repo.active()!
    repo.save(p.id, '测试', { ...active, apiKey: '', model: 'model-b' })
    expect(active.model).toBe('model-a')
    expect(repo.active()?.model).toBe('model-b')
    expect(repo.list()[0].settings.apiKey).toBe('')
    repo.setRoute('reading', p.id)
    repo.select('')
    expect(repo.active()).toBeNull()
    expect(repo.forPurpose('reading')?.model).toBe('model-b')
    expect(repo.routes()).toEqual({ reading: p.id })
    db.close()
  })
})
