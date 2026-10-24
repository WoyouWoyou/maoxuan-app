import fs from 'node:fs'
import Database from 'better-sqlite3'
import { migrate, DATABASE_VERSION } from './migrations'
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

export function openDatabase(file: string): Database.Database {
  const handle = new Database(file)
  try {
    handle.pragma('journal_mode = WAL')
    handle.pragma('foreign_keys = ON')
    const version = Number(handle.pragma('user_version', { simple: true }))
    if (version > DATABASE_VERSION) throw new Error('数据库来自更新版本，请升级应用')
    if (
      version < DATABASE_VERSION &&
      file !== ':memory:' &&
      !fs.existsSync(`${file}.before-v${DATABASE_VERSION}`)
    )
      handle.exec(`VACUUM INTO '${`${file}.before-v${DATABASE_VERSION}`.replace(/'/g, "''")}'`)
    handle.exec(SCHEMA)
    const columns = handle.pragma('table_info(sessions)') as { name: string }[]
    if (!columns.some((c) => c.name === 'deleted_at'))
      handle.exec('ALTER TABLE sessions ADD COLUMN deleted_at TEXT')
    if (!columns.some((c) => c.name === 'mode'))
      handle.exec("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'reading'")
    migrate(handle)
    return handle
  } catch (error) {
    handle.close()
    throw error
  }
}
