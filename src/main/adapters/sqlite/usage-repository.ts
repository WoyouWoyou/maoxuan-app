import type Database from 'better-sqlite3'
import type {
  CallContext,
  TokenUsage,
  UsageQuery,
  UsageRow,
  UsageStats
} from '@shared/contracts/usage'
export function createUsageRepository(db: Database.Database) {
  function recover(): void {
    db.prepare("UPDATE model_calls SET status='interrupted' WHERE status='running'").run()
  }
  function beginCall(id: string, ctx: CallContext, model: string, endpoint: string): void {
    db.prepare(
      `INSERT OR IGNORE INTO model_calls(id,operation_id,run_id,session_id,book_id,revision_id,purpose,model,endpoint,status,started_at,details) VALUES(?,?,?,?,?,?,?,?,?,'running',?,?)`
    ).run(
      id,
      ctx.operationId ?? id,
      ctx.runId ?? null,
      ctx.sessionId ?? null,
      ctx.bookId ?? null,
      ctx.revisionId ?? null,
      ctx.purpose,
      model,
      endpoint,
      new Date().toISOString(),
      JSON.stringify({ modelConfigId: ctx.modelConfigId, requestOptions: ctx.requestOptions })
    )
  }
  function finishCall(id: string, status: string, usage: TokenUsage, duration: number): void {
    const original = db.prepare('SELECT details FROM model_calls WHERE id=?').get(id) as
      { details: string | null } | undefined
    db.prepare(
      'UPDATE model_calls SET status=?,ended_at=?,duration_ms=?,input_tokens=?,output_tokens=?,total_tokens=?,usage_source=?,completeness=?,details=? WHERE id=?'
    ).run(
      status,
      new Date().toISOString(),
      duration,
      usage.input,
      usage.output,
      usage.total,
      usage.source,
      usage.completeness,
      JSON.stringify({
        ...JSON.parse(original?.details || '{}'),
        reasoning: usage.reasoning,
        cacheRead: usage.cacheRead
      }),
      id
    )
  }
  function queryUsage(query: UsageQuery = {}): UsageStats {
    const clauses: string[] = [],
      params: any[] = []
    if (query.days) {
      clauses.push('started_at>=?')
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - Math.max(0, Math.min(3650, query.days) - 1))
      params.push(d.toISOString())
    }
    if (query.bookId) {
      clauses.push('book_id=?')
      params.push(query.bookId)
    }
    if (query.sessionId) {
      clauses.push('session_id=?')
      params.push(query.sessionId)
    }
    const rows = db
      .prepare(
        `SELECT purpose,model,COUNT(*) calls,COALESCE(SUM(input_tokens),0) input,COALESCE(SUM(output_tokens),0) output,COALESCE(SUM(total_tokens),0) total,SUM(usage_source='estimated') estimated,SUM(usage_source='unknown' OR completeness='partial') unknown,SUM(status NOT IN ('succeeded','running')) failed FROM model_calls ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} GROUP BY purpose,model ORDER BY total DESC`
      )
      .all(...params) as UsageRow[]
    return {
      rows,
      calls: rows.reduce((n, r) => n + r.calls, 0),
      total: rows.reduce((n, r) => n + r.total, 0),
      estimated: rows.reduce((n, r) => n + r.estimated, 0),
      unknown: rows.reduce((n, r) => n + r.unknown, 0)
    }
  }

  return { beginCall, finishCall, queryUsage, recover }
}
