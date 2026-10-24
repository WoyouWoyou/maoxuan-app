import { useEffect, useState } from 'react'
import type { ProxySettings } from '@shared/contracts/proxy'

export function ProxySettingsPanel() {
  const [form, setForm] = useState<ProxySettings>({ enabled: false, url: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let alive = true
    window.api.settings
      .getProxy()
      .then((value) => {
        if (alive) setForm(value)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])
  function patch(part: Partial<ProxySettings>) {
    setForm((previous) => ({ ...previous, ...part }))
    setSaved(false)
    setError('')
  }
  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      setForm(await window.api.settings.setProxy(form))
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section aria-labelledby="proxy-heading">
      <h2 id="proxy-heading">网络代理</h2>
      <p className="field-hint">
        开启并保存后，应用内所有联网请求统一通过代理，包括阅读、陪读、工作台、全书索引和连接测试。所有模型配置共用，重启后自动恢复。
      </p>
      <div className="field">
        <label htmlFor="proxy-enabled">
          <input
            id="proxy-enabled"
            type="checkbox"
            checked={form.enabled}
            disabled={loading || saving}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />{' '}
          启用全局代理
        </label>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="proxy-url">
          代理地址
        </label>
        <input
          id="proxy-url"
          className="input"
          value={form.url}
          placeholder="http://127.0.0.1:7890"
          autoComplete="off"
          spellCheck={false}
          disabled={loading || saving}
          onChange={(e) => patch({ url: e.target.value })}
        />
        <div className="field-hint">
          支持 HTTP、HTTPS、SOCKS5，例如
          socks5://127.0.0.1:1080；暂不支持账号密码。关闭后直连，保留地址。代理不可用时请求会报错，不会自动切换直连。
        </div>
      </div>
      <div className="set-actions">
        <button
          className="btn btn-primary"
          disabled={loading || saving}
          onClick={() => void save()}
        >
          {saving ? '正在保存…' : '保存代理设置'}
        </button>
        {saved ? (
          <span className="ok-text" role="status">
            已保存，立即生效
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="error-text" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  )
}
