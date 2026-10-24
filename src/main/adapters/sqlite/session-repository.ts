import type Database from 'better-sqlite3'
import type { ChatMessage, Session, SessionSummary, Version, VersionSummary } from '@shared/types'
import { decodeSessionData, type SessionRepository } from '../../modules/sessions/public'
interface Row {
  id: string
  title: string
  mode: Session['mode']
  current_step: Session['currentStep']
  status: Session['status']
  deleted_at: string | null
  state_version: number
  version_no: number
  created_at: string
  updated_at: string
  data: string
  book_id: string
  book_title: string
}
interface VersionRow {
  id: string
  session_id: string
  version_no: number
  step: Version['step']
  label: string
  data: string
  created_at: string
}
const summary = (r: Row): SessionSummary => ({
  id: r.id,
  title: r.title,
  mode: r.mode,
  currentStep: r.current_step,
  status: r.status,
  deletedAt: r.deleted_at,
  stateVersion: r.state_version,
  versionNo: r.version_no,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  bookId: r.book_id,
  bookTitle: r.book_title
})
const versionSummary = (r: VersionRow): VersionSummary => ({
  id: r.id,
  sessionId: r.session_id,
  versionNo: r.version_no,
  step: r.step,
  label: r.label,
  createdAt: r.created_at
})
export function createSessionRepository(db: Database.Database): SessionRepository {
  const get = (id: string): Session | null => {
    const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Row | undefined
    return row ? { ...summary(row), data: decodeSessionData(row.data) } : null
  }
  return {
    transaction: (work) => db.transaction(work)(),
    get,
    list: (filter) => {
      const where =
        filter === 'trash' ? 'deleted_at IS NOT NULL' : `deleted_at IS NULL AND status='${filter}'`
      return (
        db
          .prepare(
            `SELECT id,title,mode,current_step,status,deleted_at,state_version,version_no,created_at,updated_at,book_id,book_title FROM sessions WHERE ${where} ORDER BY ${filter === 'trash' ? 'deleted_at' : 'updated_at'} DESC`
          )
          .all() as Row[]
      ).map(summary)
    },
    insert: (s) => {
      db.prepare(
        'INSERT INTO sessions(id,title,mode,current_step,status,deleted_at,state_version,version_no,created_at,updated_at,book_id,book_title,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        s.id,
        s.title,
        s.mode,
        s.currentStep,
        s.status,
        s.deletedAt,
        s.stateVersion,
        s.versionNo,
        s.createdAt,
        s.updatedAt,
        s.data.book?.bookId ?? 'maoxuan',
        s.data.book?.title ?? '毛泽东选集',
        JSON.stringify(s.data)
      )
    },
    save: (s) => {
      db.prepare(
        'UPDATE sessions SET title=?,current_step=?,status=?,deleted_at=?,state_version=?,version_no=?,updated_at=?,data=?,book_id=?,book_title=? WHERE id=?'
      ).run(
        s.title,
        s.currentStep,
        s.status,
        s.deletedAt,
        s.stateVersion,
        s.versionNo,
        s.updatedAt,
        JSON.stringify(s.data),
        s.data.book?.bookId ?? 'maoxuan',
        s.data.book?.title ?? '毛泽东选集',
        s.id
      )
    },
    delete: (id) => {
      db.prepare('DELETE FROM sessions WHERE id=?').run(id)
    },
    purge: (deadline) =>
      db
        .prepare(
          `DELETE FROM sessions WHERE deleted_at IS NOT NULL${deadline ? ' AND deleted_at < ?' : ''}`
        )
        .run(...(deadline ? [deadline] : [])).changes,
    versions: (id) =>
      (
        db
          .prepare(
            'SELECT id,session_id,version_no,step,label,created_at FROM versions WHERE session_id=? ORDER BY version_no DESC'
          )
          .all(id) as VersionRow[]
      ).map(versionSummary),
    version: (id) => {
      const row = db.prepare('SELECT * FROM versions WHERE id=?').get(id) as VersionRow | undefined
      return row ? { ...versionSummary(row), data: decodeSessionData(row.data) } : null
    },
    snapshot: (v) => {
      db.prepare(
        'INSERT INTO versions(id,session_id,version_no,step,label,data,created_at) VALUES(?,?,?,?,?,?,?)'
      ).run(v.id, v.sessionId, v.versionNo, v.step, v.label, JSON.stringify(v.data), v.createdAt)
    },
    receipt: (id, mutationId) =>
      (
        db
          .prepare('SELECT signature FROM session_mutations WHERE session_id=? AND id=?')
          .get(id, mutationId) as { signature: string } | undefined
      )?.signature,
    remember: (id, mutationId, signature) => {
      db.prepare('INSERT INTO session_mutations(session_id,id,signature) VALUES(?,?,?)').run(
        id,
        mutationId,
        signature
      )
    },
    messages: (id) =>
      (
        db
          .prepare('SELECT * FROM messages WHERE session_id=? ORDER BY created_at,rowid')
          .all(id) as {
          id: string
          session_id: string
          role: ChatMessage['role']
          content: string
          article_id: string | null
          created_at: string
        }[]
      ).map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        articleId: r.article_id,
        createdAt: r.created_at
      })),
    addMessage: (m) => {
      db.prepare(
        'INSERT INTO messages(id,session_id,role,content,article_id,created_at) VALUES(?,?,?,?,?,?)'
      ).run(m.id, m.sessionId, m.role, m.content, m.articleId, m.createdAt)
    },
    clearMessages: (id) => {
      db.prepare('DELETE FROM messages WHERE session_id=?').run(id)
    }
  }
}
