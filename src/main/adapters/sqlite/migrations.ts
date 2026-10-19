import type Database from 'better-sqlite3'
export function migrate(handle: Database.Database): void {
  const version = Number(handle.pragma('user_version', { simple: true }))
  if (version < 1)
    handle.transaction(() => {
      const add = (table: string, column: string, definition: string) => {
        if (
          !(handle.pragma(`table_info(${table})`) as { name: string }[]).some(
            (c) => c.name === column
          )
        )
          handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      }
      add('articles', 'book_id', "TEXT NOT NULL DEFAULT 'maoxuan'")
      add('articles', 'revision_id', "TEXT NOT NULL DEFAULT 'maoxuan-v1'")
      add('articles', 'source', "TEXT NOT NULL DEFAULT ''")
      add('sessions', 'state_version', 'INTEGER NOT NULL DEFAULT 0')
      handle.exec(`
      CREATE TABLE books (id TEXT PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, author TEXT NOT NULL, format TEXT NOT NULL, profile TEXT NOT NULL, hash TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE INDEX articles_scope ON articles(revision_id, ord);
      CREATE TABLE paragraphs (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE, ord INTEGER NOT NULL, content TEXT NOT NULL, UNIQUE(article_id, ord));
      CREATE TABLE chapter_index (article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE, signature TEXT NOT NULL, summary TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, error TEXT, result TEXT, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE model_calls (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, run_id TEXT, session_id TEXT, book_id TEXT, revision_id TEXT, purpose TEXT NOT NULL, model TEXT NOT NULL, endpoint TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, duration_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, usage_source TEXT NOT NULL DEFAULT 'unknown', completeness TEXT NOT NULL DEFAULT 'partial', details TEXT);
      CREATE INDEX model_calls_created ON model_calls(started_at);
      CREATE INDEX model_calls_scope ON model_calls(book_id, session_id, purpose);
      PRAGMA user_version = 1;
    `)
    })()
  if (version < 2)
    handle.transaction(() => {
      handle.exec(`CREATE TABLE IF NOT EXISTS model_profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,config TEXT NOT NULL,secret TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS index_blocks(article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,signature TEXT NOT NULL,ord INTEGER NOT NULL,summary TEXT NOT NULL,PRIMARY KEY(article_id,signature,ord));
      PRAGMA user_version = 2;`)
    })()
}
