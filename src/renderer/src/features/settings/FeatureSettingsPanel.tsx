import { useFeaturePreferences } from './feature-preferences'
export function FeatureSettingsPanel() {
  const { preferences, loaded, saving, error, update, refresh } = useFeaturePreferences()
  return (
    <section
      className="reader-settings-section"
      aria-label="功能显示设置"
      style={{ marginBottom: 24 }}
    >
      <h2>功能显示</h2>
      <label className="reader-setting-row">
        <span>显示「长征不怕远征难」</span>
        <input
          className="reader-switch"
          type="checkbox"
          role="switch"
          checked={preferences.longMarch}
          disabled={!loaded || saving}
          aria-describedby="march-visibility-hint"
          onChange={(event) => void update({ ...preferences, longMarch: event.target.checked })}
        />
      </label>
      <p className="reader-option-hint" id="march-visibility-hint">
        关闭后隐藏长征入口与成长提示，已有进度和收藏保留，可随时重新开启。更改自动保存。
      </p>
      {saving && (
        <p role="status" className="muted">
          正在保存…
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}{' '}
          <button className="btn btn-sm" onClick={() => void refresh()}>
            重新读取
          </button>
        </p>
      )}
    </section>
  )
}
