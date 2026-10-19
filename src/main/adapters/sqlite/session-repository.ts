import path from 'path'
import fs from 'node:fs'
import { safeStorage } from 'electron'
import { migrate } from './migrations'
import {
  activeModel,
  saveModel,
  listModels,
  modelForPurpose
} from '../../modules/model-config/public'
import { requireBook } from '../../modules/library/public'
import { validateReadingData } from '../../modules/reading/validation'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import Database from 'better-sqlite3'
import {
  emptySessionData,
  emptyWorkbench,
  type ChatMessage,
  type Session,
  type SessionData,
  type SessionMode,
  type SessionPatch,
  type SessionSummary,
  type Settings,
  type StepKey,
  type Version,
  type VersionSummary,
  type WbDiagnosis,
  type WbForm,
  type WorkbenchData
} from '@shared/types'

type SqliteDb = InstanceType<typeof Database>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, current_step TEXT NOT NULL DEFAULT 'problem',
  status TEXT NOT NULL DEFAULT 'active', mode TEXT NOT NULL DEFAULT 'reading', data TEXT NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL, step TEXT NOT NULL, label TEXT NOT NULL, data TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(session_id, version_no));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, article_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, volume TEXT NOT NULL, is_core INTEGER NOT NULL,
  core_order INTEGER, content TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(title, content, content='articles', content_rowid='rowid', tokenize='trigram');
`

interface SessionRow {
  id: string
  title: string
  current_step: string
  status: string
  mode: string
  data: string
  version_no: number
  deleted_at: string | null
  state_version: number
  created_at: string
  updated_at: string
}

interface VersionRow {
  id: string
  session_id: string
  version_no: number
  step: string
  label: string
  data: string
  created_at: string
}

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  article_id: string | null
  created_at: string
}

let db: SqliteDb | null = null

export function initDb(): SqliteDb {
  if (db) return db
  const handle = new Database(path.join(app.getPath('userData'), 'maoxuan.db'))
  handle.pragma('journal_mode = WAL')
  handle.pragma('foreign_keys = ON')
  handle.exec(SCHEMA)

  const columns = handle.pragma('table_info(sessions)') as { name: string }[]
  if (!columns.some((column) => column.name === 'deleted_at')) {
    handle.exec('ALTER TABLE sessions ADD COLUMN deleted_at TEXT')
  }
  if (!columns.some((column) => column.name === 'mode')) {
    handle.exec("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'reading'")
  }

  if (Number(handle.pragma('user_version', { simple: true })) < 2) {
    const backup = path.join(app.getPath('userData'), 'maoxuan-before-multibook.db')
    if (!fs.existsSync(backup)) handle.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
    migrate(handle)
  }
  db = handle
  const key = readSetting('apiKey')
  if (key && !key.startsWith('encrypted:') && safeStorage.isEncryptionAvailable())
    handle
      .prepare('UPDATE settings SET value=? WHERE key=?')
      .run('encrypted:' + safeStorage.encryptString(key).toString('base64'), 'apiKey')
  return handle
}

export function getDb(): SqliteDb {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

function nowIso(): string {
  return new Date().toISOString()
}

/** 工作台数据结构的历史版本可能缺字段，这里统一补齐默认值。 */
function normalizeWorkbench(raw: WorkbenchData): WorkbenchData {
  const base = emptyWorkbench()
  const form = (raw.form ?? {}) as Partial<WbForm>
  const blockers = Array.isArray(form.blockers)
    ? form.blockers.map((item) => (typeof item === 'string' ? item : ''))
    : []
  while (blockers.length < 3) blockers.push('')

  const diagnosis = (raw.diagnosis ?? {}) as Partial<WbDiagnosis>
  const decision = raw.decision ? { ...raw.decision, checks: raw.decision.checks ?? [] } : null
  const actions = Array.isArray(raw.actions) ? raw.actions : []

  return {
    form: {
      projectName: form.projectName ?? base.form.projectName,
      objective: form.objective ?? base.form.objective,
      timeScale: form.timeScale ?? base.form.timeScale,
      stage: form.stage ?? base.form.stage,
      blockers,
      background: form.background ?? base.form.background,
      knownFacts: form.knownFacts ?? base.form.knownFacts,
      opponents: form.opponents ?? base.form.opponents,
      allies: form.allies ?? base.form.allies,
      swing: form.swing ?? base.form.swing
    },
    intake: raw.intake ?? null,
    diagnosis: {
      contradiction: diagnosis.contradiction ?? null,
      routes: diagnosis.routes ?? null,
      objSubj: diagnosis.objSubj ?? null
    },
    decision,
    actions: actions.map((action) => ({ ...action, progress: action.progress ?? [] })),
    actionChecks: raw.actionChecks ?? [],
    ledger: raw.ledger ?? []
  }
}

function parseData(value: string): SessionData {
  const data = JSON.parse(value) as SessionData
  data.readings = (data.readings ?? []).map((r) => ({ ...r, reflections: r.reflections ?? [] }))
  data.actions = (data.actions ?? []).map((a) => ({ ...a, progress: a.progress ?? [] }))
  if (data.workbench) data.workbench = normalizeWorkbench(data.workbench)
  data.book ??= {
    bookId: 'maoxuan',
    revisionId: 'maoxuan-v1',
    title: '毛泽东选集',
    profile: 'maoxuan',
    profileVersion: '1'
  }
  return data
}

function rowToSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode === 'workbench' ? 'workbench' : 'reading',
    currentStep: row.current_step as StepKey,
    status: row.status === 'archived' ? 'archived' : 'active',
    deletedAt: row.deleted_at ?? null,
    stateVersion: row.state_version,
    bookId: parseData(row.data).book?.bookId ?? 'maoxuan',
    bookTitle: parseData(row.data).book?.title ?? '毛泽东选集',
    versionNo: row.version_no,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToSession(row: SessionRow): Session {
  return { ...rowToSummary(row), data: parseData(row.data) }
}

function rowToVersionSummary(row: VersionRow): VersionSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    versionNo: row.version_no,
    step: row.step as StepKey,
    label: row.label,
    createdAt: row.created_at
  }
}

function rowToVersion(row: VersionRow): Version {
  return { ...rowToVersionSummary(row), data: parseData(row.data) }
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    articleId: row.article_id,
    createdAt: row.created_at
  }
}

function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined
  return row ? row.value : null
}

function readSettingWithFallback(key: string, envName: string, fallback: string): string {
  const stored = readSetting(key)
  if (stored !== null && stored !== '') return stored
  const fromEnv = process.env[envName]
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return fallback
}

function readApiKey(): string {
  const stored = readSetting('apiKey') ?? ''
  if (stored.startsWith('encrypted:')) {
    if (!safeStorage.isEncryptionAvailable()) return ''
    return safeStorage.decryptString(Buffer.from(stored.slice(10), 'base64'))
  }
  return stored || process.env.DEEPSEEK_API_KEY || ''
}
export function publicSettings(): Settings {
  const settings = getSettings()
  return { ...settings, apiKey: '', hasApiKey: !!settings.apiKey }
}
export function getSettings(purpose?: string): Settings {
  if (purpose) {
    const routed = modelForPurpose(purpose)
    if (routed) return routed
  }
  const active = activeModel()
  if (active) return active
  return {
    apiKey: readApiKey(),
    temperatureEnabled: readSetting('temperatureEnabled') !== 'false',
    streamUsage: readSetting('streamUsage') !== 'false',
    baseUrl: readSettingWithFallback('baseUrl', 'DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
    model: readSettingWithFallback('model', 'DEEPSEEK_MODEL', 'deepseek-v4-flash')
  }
}

export function setSettings(settings: Settings): Settings {
  if (settings.configId) {
    const name = listModels().find((m) => m.id === settings.configId)?.name ?? '模型配置'
    saveModel(settings.configId, name, settings)
    return publicSettings()
  }
  const handle = getDb()
  const upsert = handle.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const run = handle.transaction((value: Settings) => {
    if (value.apiKey.trim()) {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error('系统密钥存储不可用，请启用系统密钥环')
      upsert.run(
        'apiKey',
        'encrypted:' + safeStorage.encryptString(value.apiKey.trim()).toString('base64')
      )
    }
    upsert.run('temperatureEnabled', String(value.temperatureEnabled !== false))
    upsert.run('streamUsage', String(value.streamUsage !== false))
    upsert.run('baseUrl', value.baseUrl.trim().replace(/\/+$/, '') || 'https://api.deepseek.com/v1')
    upsert.run('model', value.model.trim() || 'deepseek-v4-flash')
  })
  run(settings)
  return publicSettings()
}

export function listSessions(): SessionSummary[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM sessions WHERE deleted_at IS NULL AND status = 'active' ORDER BY updated_at DESC"
    )
    .all() as SessionRow[]
  return rows.map(rowToSummary)
}

export function listArchivedSessions(): SessionSummary[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM sessions WHERE deleted_at IS NULL AND status = 'archived' ORDER BY updated_at DESC"
    )
    .all() as SessionRow[]
  return rows.map(rowToSummary)
}

export function listTrashSessions(): SessionSummary[] {
  const rows = getDb()
    .prepare('SELECT * FROM sessions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all() as SessionRow[]
  return rows.map(rowToSummary)
}

export function getSession(id: string): Session | null {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
    SessionRow | undefined
  return row ? rowToSession(row) : null
}

export function createSession(
  problemText: string,
  mode: SessionMode = 'reading',
  bookId = 'maoxuan'
): Session {
  const handle = getDb()
  const id = randomUUID()
  const timestamp = nowIso()
  const text = problemText.trim()
  const title = text.slice(0, 24) || '未命名问题'
  const data = emptySessionData()
  const book = requireBook(mode === 'workbench' ? 'maoxuan' : bookId)
  if (book.hidden) throw new Error('书籍已隐藏，请先恢复书籍')
  data.book = {
    bookId: book.bookId,
    revisionId: book.revisionId,
    title: book.title,
    profile: book.profile,
    profileVersion: '1'
  }

  let currentStep: StepKey = 'problem'
  let label = '创建问题'
  if (mode === 'workbench') {
    data.workbench = emptyWorkbench(text)
    currentStep = 'wb_intake'
    label = '创建项目'
  } else {
    data.problem.text = text
  }
  const payload = JSON.stringify(data)

  const run = handle.transaction(() => {
    handle
      .prepare(
        'INSERT INTO sessions (id, title, current_step, status, mode, data, version_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, title, currentStep, 'active', mode, payload, 1, timestamp, timestamp)
    handle
      .prepare(
        'INSERT INTO versions (id, session_id, version_no, step, label, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(randomUUID(), id, 1, currentStep, label, payload, timestamp)
  })
  run()

  const session = getSession(id)
  if (!session) throw new Error('会话不存在')
  return session
}

export function updateSession(id: string, patch: SessionPatch, versionLabel?: string): Session {
  const handle = getDb()
  const run = handle.transaction(() => {
    const row = handle.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      SessionRow | undefined
    if (!row) throw new Error('会话不存在')

    if (
      patch.expectedStateVersion !== undefined &&
      patch.expectedStateVersion !== row.state_version
    )
      throw new Error('内容已在其他窗口更新，请重新打开问题后重试')
    const previous = parseData(row.data)
    const nextData: SessionData = patch.data ?? previous
    validateReadingData(previous, nextData)
    const nextStep: StepKey = patch.currentStep ?? (row.current_step as StepKey)
    const nextTitle = patch.title ?? row.title
    const nextStatus = patch.status ?? row.status
    const timestamp = nowIso()
    const bump = Boolean(versionLabel)
    const versionNo = bump ? row.version_no + 1 : row.version_no
    const payload = JSON.stringify(nextData)

    handle
      .prepare(
        'UPDATE sessions SET title = ?, current_step = ?, status = ?, data = ?, version_no = ?, state_version = state_version + 1, updated_at = ? WHERE id = ?'
      )
      .run(nextTitle, nextStep, nextStatus, payload, versionNo, timestamp, id)

    if (bump) {
      handle
        .prepare(
          'INSERT INTO versions (id, session_id, version_no, step, label, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(randomUUID(), id, versionNo, nextStep, versionLabel as string, payload, timestamp)
    }
  })
  run()

  const session = getSession(id)
  if (!session) throw new Error('会话不存在')
  return session
}

export function removeSession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function archiveSession(id: string): void {
  const changes = getDb()
    .prepare("UPDATE sessions SET status = 'archived', updated_at = ? WHERE id = ?")
    .run(nowIso(), id).changes
  if (changes === 0) throw new Error('会话不存在')
}

export function unarchiveSession(id: string): void {
  const changes = getDb()
    .prepare("UPDATE sessions SET status = 'active', updated_at = ? WHERE id = ?")
    .run(nowIso(), id).changes
  if (changes === 0) throw new Error('会话不存在')
}

export function trashSession(id: string): void {
  const changes = getDb()
    .prepare('UPDATE sessions SET deleted_at = ? WHERE id = ?')
    .run(nowIso(), id).changes
  if (changes === 0) throw new Error('会话不存在')
}

export function restoreSession(id: string): void {
  const changes = getDb()
    .prepare('UPDATE sessions SET deleted_at = NULL, updated_at = ? WHERE id = ?')
    .run(nowIso(), id).changes
  if (changes === 0) throw new Error('会话不存在')
}

export function emptyTrash(): number {
  return getDb().prepare('DELETE FROM sessions WHERE deleted_at IS NOT NULL').run().changes
}

export function purgeExpiredTrash(days: number): number {
  const deadline = new Date(Date.now() - days * 86400000).toISOString()
  return getDb()
    .prepare('DELETE FROM sessions WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .run(deadline).changes
}

export function listVersions(sessionId: string): VersionSummary[] {
  const rows = getDb()
    .prepare('SELECT * FROM versions WHERE session_id = ? ORDER BY version_no DESC')
    .all(sessionId) as VersionRow[]
  return rows.map(rowToVersionSummary)
}

export function getVersion(id: string): Version | null {
  const row = getDb().prepare('SELECT * FROM versions WHERE id = ?').get(id) as
    VersionRow | undefined
  return row ? rowToVersion(row) : null
}

export function restoreVersion(versionId: string): Session {
  const handle = getDb()
  let sessionId = ''

  const run = handle.transaction(() => {
    const version = handle.prepare('SELECT * FROM versions WHERE id = ?').get(versionId) as
      VersionRow | undefined
    if (!version) throw new Error('版本不存在')

    const row = handle.prepare('SELECT * FROM sessions WHERE id = ?').get(version.session_id) as
      SessionRow | undefined
    if (!row) throw new Error('会话不存在')

    sessionId = row.id
    const timestamp = nowIso()
    const versionNo = row.version_no + 1
    const label = `恢复自 v${version.version_no}`

    handle
      .prepare(
        'UPDATE sessions SET data = ?, current_step = ?, version_no = ?, state_version = state_version + 1, updated_at = ? WHERE id = ?'
      )
      .run(version.data, version.step, versionNo, timestamp, row.id)

    handle
      .prepare(
        'INSERT INTO versions (id, session_id, version_no, step, label, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(randomUUID(), row.id, versionNo, version.step, label, version.data, timestamp)
  })
  run()

  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')
  return session
}

export function listMessages(sessionId: string): ChatMessage[] {
  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(sessionId) as MessageRow[]
  return rows.map(rowToMessage)
}

export function addMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  articleId: string | null = null
): ChatMessage {
  const message: ChatMessage = {
    id: randomUUID(),
    sessionId,
    role,
    content,
    articleId,
    createdAt: nowIso()
  }
  getDb()
    .prepare(
      'INSERT INTO messages (id, session_id, role, content, article_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      message.id,
      message.sessionId,
      message.role,
      message.content,
      message.articleId,
      message.createdAt
    )
  return message
}

export function clearMessages(sessionId: string): void {
  getDb().prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
}
