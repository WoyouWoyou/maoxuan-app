import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { TrashPanel } from '../components/TrashPanel'

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function SettingsPage() {
  const [form, setForm] = useState<Settings>({ apiKey: '', baseUrl: '', model: '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.settings
      .get()
      .then((s) => {
        if (!alive) return
        setForm(s)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setLoadError(errText(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  function patch(part: Partial<Settings>) {
    setForm((prev) => ({ ...prev, ...part }))
    setSaved(false)
    setError(null)
    setTestResult(null)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSaved(false)
    setTestResult(null)
    try {
      const next = await window.api.settings.set(form)
      setForm(next)
      setSaved(true)
    } catch (e) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    if (testing) return
    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const res = await window.api.settings.test()
      setTestResult(res)
    } catch (e) {
      setTestResult({ ok: false, message: errText(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="set">
      <h1 className="set-title">设置</h1>
      <p className="set-desc">配置 DeepSeek 接口。密钥仅保存在本机，不会上传到别处。</p>

      {loading ? (
        <div className="set-loading">
          <span className="spinner" /> 正在读取设置…
        </div>
      ) : (
        <>
          {loadError ? <div className="error-text">{loadError}</div> : null}

          <div className="field">
            <label className="field-label" htmlFor="set-key">
              API Key
            </label>
            <div className="set-key-row">
              <input
                id="set-key"
                className="input"
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => patch({ apiKey: e.target.value })}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <div className="field-hint">未填写时无法使用教练功能，会提示“请先在设置中填写 DeepSeek API Key”。</div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="set-base">
              Base URL
            </label>
            <input
              id="set-base"
              className="input"
              value={form.baseUrl}
              placeholder={DEFAULT_BASE_URL}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => patch({ baseUrl: e.target.value })}
            />
            <div className="field-hint">留空则使用默认 {DEFAULT_BASE_URL}</div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="set-model">
              Model
            </label>
            <input
              id="set-model"
              className="input"
              value={form.model}
              placeholder={DEFAULT_MODEL}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => patch({ model: e.target.value })}
            />
            <div className="field-hint">留空则使用默认 {DEFAULT_MODEL}</div>
          </div>

          <div className="set-actions">
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? <span className="spinner" /> : null}
              保存
            </button>
            <button className="btn btn-ghost" onClick={() => void test()} disabled={testing}>
              {testing ? <span className="spinner" /> : null}
              测试连接
            </button>
            {saved ? <span className="ok-text">已保存</span> : null}
            {testResult ? (
              <span className={testResult.ok ? 'ok-text' : 'error-text'}>
                {testResult.ok ? '连接正常：' : '连接失败：'}
                {testResult.message}
              </span>
            ) : null}
          </div>

          {error ? <div className="error-text">{error}</div> : null}

          <div className="set-hint">
            密钥仅保存在本机 SQLite 数据库（userData/maoxuan.db）中。测试连接使用的是已保存的设置，改完请先点“保存”。
          </div>
        </>
      )}

      <h2 className="set-title" style={{ fontSize: 20, marginTop: 32 }}>
        回收站与归档
      </h2>
      <TrashPanel />
    </div>
  )
}
