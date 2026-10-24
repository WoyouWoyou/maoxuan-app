import { TextAlignCenterIcon, TextAlignJustifyIcon, PlayIcon, XIcon } from '@phosphor-icons/react'
import { EDGE_VOICES } from '@shared/contracts/reader'
import { useReaderPreferences } from './preferences'
import './reader-options.css'

export function ReaderPreferencesFields() {
  const { preferences: p, update, loaded, error } = useReaderPreferences()
  return (
    <fieldset className="reader-preferences" disabled={!loaded}>
      <legend className="sr-only">阅读偏好</legend>
      <h3>排版</h3>
      <div className="reader-layout-choices" role="group" aria-label="正文排版">
        <button
          type="button"
          aria-pressed={p.layout === 'centered'}
          className={p.layout === 'centered' ? 'selected' : ''}
          onClick={() => update({ layout: 'centered' })}
        >
          <TextAlignCenterIcon size={42} weight="thin" />
          <strong>居中</strong>
          <small>专注阅读体验</small>
        </button>
        <button
          type="button"
          aria-pressed={p.layout === 'full'}
          className={p.layout === 'full' ? 'selected' : ''}
          onClick={() => update({ layout: 'full' })}
        >
          <TextAlignJustifyIcon size={42} weight="thin" />
          <strong>平铺</strong>
          <small>更充分利用屏幕</small>
        </button>
      </div>
      <div className="reader-speech-settings">
        <h3>朗读</h3>
        <label className="reader-setting-row">
          <span>启用朗读</span>
          <input
            className="reader-switch"
            type="checkbox"
            role="switch"
            checked={p.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        </label>
        <label className="reader-setting-row">
          <span>语音服务</span>
          <select
            disabled={!p.enabled}
            value={p.provider}
            onChange={(e) => update({ provider: e.target.value as 'edge' | 'system' })}
          >
            <option value="edge">Edge 在线语音</option>
            <option value="system">系统语音</option>
          </select>
        </label>
        <label className="reader-setting-row">
          <span>选择音色</span>
          <select
            disabled={!p.enabled || p.provider === 'system'}
            value={p.voice}
            onChange={(e) => update({ voice: e.target.value })}
          >
            {EDGE_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {p.provider === 'system' && <p className="reader-option-hint">使用系统可用的中文声音。</p>}
        <label className="reader-setting-row">
          <span>朗读速度</span>
          <select
            disabled={!p.enabled}
            value={p.rate}
            onChange={(e) => update({ rate: Number(e.target.value) })}
          >
            {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate === 1 || rate === 2 ? rate.toFixed(1) : rate}×
              </option>
            ))}
          </select>
        </label>
        <label className="reader-follow">
          <input
            disabled={!p.enabled}
            type="checkbox"
            checked={p.follow}
            onChange={(e) => update({ follow: e.target.checked })}
          />
          跟随滚动
        </label>
        <p className="reader-option-hint">
          {p.provider === 'edge'
            ? '联网合成，正文发送至微软语音服务。免密钥的非官方接入，服务可能变化。'
            : '可用声音取决于当前系统，缺少中文声音时请使用 Edge。'}
        </p>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!loaded && !error && <p className="reader-option-hint">正在读取阅读选项…</p>}
    </fieldset>
  )
}
export function ReaderOptions({
  onClose,
  onRead,
  canRead
}: {
  onClose(): void
  onRead(): void
  canRead: boolean
}) {
  const { preferences, loaded } = useReaderPreferences()
  return (
    <>
      <header className="reader-options-head">
        <h2>阅读选项</h2>
        <button
          type="button"
          className="reader-icon-button"
          aria-label="关闭阅读选项"
          onClick={onClose}
        >
          <XIcon size={18} />
        </button>
      </header>
      <ReaderPreferencesFields />
      <button
        type="button"
        className="btn btn-primary reader-read-all"
        disabled={!preferences.enabled || !loaded || !canRead}
        onClick={onRead}
      >
        <PlayIcon size={17} weight="fill" />
        朗读全文
      </button>
    </>
  )
}
