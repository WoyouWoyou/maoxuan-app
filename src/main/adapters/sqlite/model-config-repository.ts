import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Settings } from '@shared/types'
import type { ModelProfile } from '@shared/contracts/models'
export interface CredentialCodec {
  encrypt(value: string): string
  decrypt(value: string): string
}
export function createModelConfigRepository(db: Database.Database, codec: CredentialCodec) {
  const row = (id: string) => db.prepare('SELECT * FROM model_profiles WHERE id=?').get(id) as any
  const list = (): ModelProfile[] =>
    (db.prepare('SELECT * FROM model_profiles ORDER BY rowid').all() as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      active: !!r.active,
      settings: { ...JSON.parse(r.config), apiKey: '', hasApiKey: !!r.secret, configId: r.id }
    }))
  function save(id: string | undefined, name: string, settings: Settings): ModelProfile {
    if (!name.trim() || !settings.model.trim()) throw new Error('请填写配置名称和模型名称')
    const url = new URL(settings.baseUrl)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('模型地址必须为 HTTP 或 HTTPS')
    const existing = id ? row(id) : null
    if (id && !existing) throw new Error('模型配置不存在')
    const secret = settings.apiKey.trim() ? codec.encrypt(settings.apiKey.trim()) : existing?.secret
    if (!secret) throw new Error('新配置需要填写 API Key')
    const config = {
      baseUrl: settings.baseUrl.replace(/\/+$/, ''),
      model: settings.model.trim(),
      temperatureEnabled: settings.temperatureEnabled !== false,
      streamUsage: settings.streamUsage !== false
    }
    const key = id ?? randomUUID()
    db.transaction(() => {
      db.prepare(
        'INSERT INTO model_profiles(id,name,config,secret,active) VALUES(?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,config=excluded.config,secret=excluded.secret'
      ).run(key, name.trim().slice(0, 100), JSON.stringify(config), secret)
    })()
    return list().find((r) => r.id === key)!
  }
  const decryptRow = (r: any): Settings | null =>
    r ? { ...JSON.parse(r.config), apiKey: codec.decrypt(r.secret), configId: r.id } : null
  return {
    routes: (): Record<string, string> =>
      Object.fromEntries(
        (
          db.prepare("SELECT key,value FROM settings WHERE key LIKE 'modelRoute:%'").all() as {
            key: string
            value: string
          }[]
        ).map((r) => [r.key.slice(11), r.value])
      ),
    setRoute: (purpose: string, id: string): void => {
      if (id && !row(id)) throw new Error('模型配置不存在')
      db.prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).run('modelRoute:' + purpose, id)
    },
    forPurpose: (purpose: string): Settings | null => {
      const route = db
        .prepare('SELECT value FROM settings WHERE key=?')
        .get('modelRoute:' + purpose) as { value: string } | undefined
      return route?.value ? decryptRow(row(route.value)) : null
    },
    list,
    save,
    active: (): Settings | null => {
      const r = db.prepare('SELECT * FROM model_profiles WHERE active=1').get() as any
      return r ? { ...JSON.parse(r.config), apiKey: codec.decrypt(r.secret), configId: r.id } : null
    },
    select: (id: string) => {
      if (id !== '' && !row(id)) throw new Error('模型配置不存在')
      db.transaction(() => {
        db.prepare('UPDATE model_profiles SET active=0').run()
        if (id) db.prepare('UPDATE model_profiles SET active=1 WHERE id=?').run(id)
      })()
    }
  }
}
