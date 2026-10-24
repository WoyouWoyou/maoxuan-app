import type Database from 'better-sqlite3'
export function createSettingsRepository(
  db: Database.Database,
  secrets: { encrypt(value: string): string; decrypt(value: string): string }
) {
  const read = (key: string): string | null =>
    (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined)
      ?.value ?? null
  const write = (key: string, value: string) => {
    db.prepare(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(key, value)
  }
  const key = read('apiKey')
  if (key && !key.startsWith('encrypted:')) write('apiKey', 'encrypted:' + secrets.encrypt(key))
  return {
    read,
    write,
    transaction: <T>(work: () => T): T => db.transaction(work)(),
    readSecret: () => {
      const v = read('apiKey')
      return v?.startsWith('encrypted:') ? secrets.decrypt(v.slice(10)) : (v ?? '')
    },
    writeSecret: (value: string) => write('apiKey', 'encrypted:' + secrets.encrypt(value))
  }
}
