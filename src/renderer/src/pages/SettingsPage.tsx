import { useEffect, useState } from 'react'
import type { ModelProfile } from '@shared/contracts/models'
import type { Settings } from '@shared/types'
import { UsagePanel } from '../features/usage/UsagePanel'
import '../features/library/library.css'
import { TrashPanel } from '../components/TrashPanel'

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function SettingsPage() {
  const [routes, setRoutes] = useState<Record<string, string>>({})
  const [profiles, setProfiles] = useState<ModelProfile[]>([])
  const [profileName, setProfileName] = useState('')
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
        void window.api.models.list().then(setProfiles)
        void window.api.models.routes().then(setRoutes)
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
      <p className="set-desc">
        配置兼容 Chat Completions 的模型服务。密钥在本机系统密钥存储中加密；请求发送至你配置的服务。
      </p>

      {loading ? (
        <div className="set-loading">
          <span className="spinner" /> 正在读取设置…
        </div>
      ) : (
        <>
          {loadError ? <div className="error-text">{loadError}</div> : null}

          <div className="field">
            <label className="field-label">当前模型配置</label>
            <select
              className="input"
              value={form.configId ?? ''}
              onChange={(e) => {
                void window.api.models
                  .select(e.target.value)
                  .then(() => window.api.settings.get())
                  .then(setForm)
                  .catch((e) => setError(errText(e)))
              }}
            >
              <option value="">原有默认配置</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
                placeholder={form.hasApiKey ? '已配置密钥；留空保留原密钥' : '输入 API Key'}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => patch({ apiKey: e.target.value })}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <div className="field-hint">
              未填写时无法使用教练功能，会提示“请先在设置中填写 DeepSeek API Key”。
            </div>
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

          <div className="field">
            <label className="field-label">保存为另一个配置（需要填写该配置的密钥）</label>
            <div className="book-toolbar">
              <input
                className="input"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="例如：本地模型 / 备用服务"
              />
              <button
                className="btn btn-ghost"
                disabled={!profileName.trim() || saving}
                onClick={() => {
                  setError(null)
                  setSaving(true)
                  void window.api.models
                    .save(undefined, profileName, form)
                    .then(async (p) => {
                      await window.api.models.select(p.id)
                      setForm(await window.api.settings.get())
                      setProfiles(await window.api.models.list())
                      setProfileName('')
                      setSaved(true)
                    })
                    .catch((e) => setError(errText(e)))
                    .finally(() => setSaving(false))
                }}
              >
                保存新配置并启用
              </button>
            </div>
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
            密钥由主进程加密保存，不回传到界面。留空保留原密钥。测试连接使用已保存的配置。
          </div>
        </>
      )}

      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={form.temperatureEnabled !== false}
            onChange={(e) => patch({ temperatureEnabled: e.target.checked })}
          />{' '}
          发送 temperature 参数
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.streamUsage !== false}
            onChange={(e) => patch({ streamUsage: e.target.checked })}
          />{' '}
          请求流式用量（服务不兼容时关闭）
        </label>
      </div>
      <h2>按功能选择模型</h2>
      {(['reading', 'workbench', 'index'] as const).map((purpose) => (
        <label className="field" key={purpose}>
          {{ reading: '阅读与陪读', workbench: '毛选工作台', index: '全书索引' }[purpose]}
          <select
            className="input"
            value={routes[purpose] ?? ''}
            onChange={(e) => {
              const id = e.target.value
              void window.api.models
                .setRoute(purpose, id)
                .then(() => setRoutes((previous) => ({ ...previous, [purpose]: id })))
                .catch((e) => setError(errText(e)))
            }}
          >
            <option value="">使用当前默认配置</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <UsagePanel />
      <h2 className="set-title" style={{ fontSize: 20, marginTop: 32 }}>
        回收站与归档
      </h2>
      <TrashPanel />
    </div>
  )
}
