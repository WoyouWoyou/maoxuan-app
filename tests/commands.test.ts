import { describe, it, expect } from 'vitest'
import { emptySessionData } from '../src/shared/types'
import { applyReadingCommands, readingCommands } from '../src/shared/contracts/reading'
import { configureReadingSessions, applyCommands } from '../src/main/modules/reading/sessions'
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
    configureReadingSessions({
      get: () => ({ id: 's', mode: 'reading', stateVersion: 3, data: before }) as any,
      update: () => {
        throw new Error('must not write')
      }
    })
    expect(() => applyCommands('s', commands, 2)).toThrow('更新')
    expect(() => applyReadingCommands(before, [{ kind: 'book', value: 'x' } as any])).toThrow(
      '未知'
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

import { validateReadingData } from '../src/main/modules/reading/validation'
import { problemSignature } from '../src/main/modules/reading/context'
describe('AI result applicability', () => {
  it('rejects late results after the user changed the problem', () => {
    const original = emptySessionData()
    const current = { ...original, problem: { ...original.problem, text: '新的问题' } }
    const diagnosis = {
      restated: '旧建议',
      symptoms: [],
      mainContradiction: '',
      stage: '',
      recommendations: [],
      _context: { problemSignature: problemSignature(original), revisionId: 'maoxuan-v1' }
    }
    expect(() => validateReadingData(current, { ...current, diagnosis })).toThrow('过时')
  })
  it('accepts an explicit problem revision without making later manual edits stale', () => {
    const previous = emptySessionData()
    const current = {
      ...previous,
      problem: { ...previous.problem, text: '明确修订的问题' },
      diagnosis: {
        restated: '新建议',
        symptoms: [],
        mainContradiction: '',
        stage: '',
        recommendations: [],
        _context: { problemSignature: problemSignature(previous), revisionId: 'maoxuan-v1' }
      }
    }
    validateReadingData(previous, current)
    expect(current.diagnosis._context.problemSignature).toBe(problemSignature(current))
    expect(() =>
      validateReadingData(current, {
        ...current,
        diagnosis: { ...current.diagnosis, restated: '手动调整' }
      })
    ).not.toThrow()
  })
})
