import { updateReaderPreferences } from '@renderer/features/reader/preferences'
import { EDGE_VOICES } from '@shared/contracts/reader'
import type { SpeechDownload } from '@shared/sync/speech'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SyncDocument, SyncPeer, SyncStrategy } from '@shared/sync/protocol'
import type { SyncResult } from '../application/sync'

const strategies: { id: SyncStrategy; title: string; detail: string }[] = [
  {
    id: 'keep-both',
    title: '融合 · 保留冲突',
    detail: '合并两端数据，发生冲突时保留两份可编辑记录。'
  },
  {
    id: 'latest',
    title: '融合 · 同名取最新',
    detail:
      '同目录的同名笔记、同类型的同名问题保留最新，较旧记录移到回收站。时间相同的记录保留两份。'
  },
  {
    id: 'prefer-phone',
    title: '覆盖 · 以手机为准',
    detail: '用手机版本覆盖两端都有的同一条记录。'
  },
  { id: 'prefer-desktop', title: '覆盖 · 以电脑为准', detail: '用电脑版覆盖两端都有的同一条记录。' }
]

const content = (d: SyncDocument) => {
  if (d.kind === 'note') return d.value.markdown
  if (d.kind === 'folder') return d.value.name
  if (d.kind === 'action') return d.value.text
  return JSON.stringify(d.value.session.data, null, 2)
}

const needsLanPermission = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 'LAN_NEARBY_PERMISSION'

export function MobileSync({
  android,
  settingsSlot,
  blocked,
  onBusyChange
}: {
  android: boolean
  settingsSlot: HTMLElement | null
  blocked: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const [devices, setDevices] = useState<SyncPeer[]>([])
  const [peer, setPeer] = useState<SyncPeer>()
  const [strategy, setStrategy] = useState<SyncStrategy>('keep-both')
  const [phase, setPhase] = useState<'invite' | 'pairing' | 'ready' | 'syncing' | 'done'>('invite')
  const [speech, setSpeech] = useState<SpeechDownload>()
  const [speechProgress, setSpeechProgress] = useState<{ ready: number; available: number }>()
  const [speechResult, setSpeechResult] = useState<{ ready: number; total: number }>()
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [discoveryError, setDiscoveryError] = useState('')
  const [permissionNeeded, setPermissionNeeded] = useState(false)
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [permissionMessage, setPermissionMessage] = useState('')
  const [scanRevision, retryDiscovery] = useState(0)
  const [result, setResult] = useState<SyncResult>()
  const dialog = useRef<HTMLDialogElement>(null)
  const seen = useRef(new Set<string>())
  const attempt = useRef(0)
  const exchanging = useRef(false)
  const connection = useRef<{ peerId: string; token: string } | undefined>(undefined)

  useEffect(() => {
    if (!android) return
    function selectSpeech(event: Event) {
      if (exchanging.current || dialog.current?.open) return
      setSpeech((event as CustomEvent<SpeechDownload>).detail)
      setSpeechProgress(undefined)
      setSpeechResult(undefined)
      setError('')
      setPhase('invite')
    }
    window.addEventListener('speech-download-request', selectSpeech)
    return () => window.removeEventListener('speech-download-request', selectSpeech)
  }, [android])

  useEffect(() => {
    if (!android || !window.api.sync.discover) return
    let active = true
    let finding = false
    async function scan() {
      if (!active || finding || document.hidden) return
      finding = true
      try {
        const found = await window.api.sync.discover!()
        if (!active || document.hidden) return
        setDevices(found)
        setDiscoveryError('')
      } catch (e) {
        if (!active) return
        setDevices([])
        setDiscoveryError(e instanceof Error ? e.message : String(e))
        if (needsLanPermission(e)) setPermissionNeeded(true)
      } finally {
        finding = false
      }
    }
    void scan()
    const timer = window.setInterval(() => void scan(), 4000)
    const resume = () => void scan()
    document.addEventListener('visibilitychange', resume)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [android, scanRevision])

  function open(device: SyncPeer) {
    seen.current.add(device.id)
    setStrategy('keep-both')
    setPeer(device)
    const previous = connection.current?.peerId === device.id ? connection.current.token : ''
    setPhase(previous ? 'ready' : 'invite')
    setError('')
    setCode('')
    setToken(previous)
    setResult(undefined)
  }

  useEffect(() => {
    if (peer || blocked) return
    if (speech) {
      const paired = devices.find((device) => device.id === connection.current?.peerId)
      if (paired) open(paired)
      return
    }
    const next = devices.find((device) => !seen.current.has(device.id))
    if (next) open(next)
  }, [devices, peer, blocked, speech])

  useEffect(() => {
    const element = dialog.current
    if ((peer || speech) && element && !element.open) element.showModal()
  }, [peer, speech])

  function close() {
    if (exchanging.current) return
    attempt.current++
    dialog.current?.close()
    setPeer(undefined)
    setSpeech(undefined)
    setToken('')
  }

  async function pair() {
    if (!peer || !window.api.sync.pair || blocked || phase !== 'invite') return
    const id = ++attempt.current
    setError('')
    setCode('')
    setPhase('pairing')
    try {
      const granted = await window.api.sync.pair(peer, (value) => {
        if (attempt.current === id) setCode(value)
      })
      if (attempt.current !== id) return
      setToken(granted)
      setPhase('ready')
    } catch (e) {
      if (attempt.current !== id) return
      setError(e instanceof Error ? e.message : String(e))
      if (needsLanPermission(e)) setPermissionNeeded(true)
      setPhase('invite')
    }
  }

  async function sync() {
    if (!peer || !token || !window.api.sync.exchange || exchanging.current || blocked) return
    connection.current = { peerId: peer.id, token }
    exchanging.current = true
    onBusyChange(true)
    setError('')
    setPhase('syncing')
    try {
      setResult(await window.api.sync.exchange(peer, token, strategy))
      window.dispatchEvent(new Event('sessions-changed'))
      window.dispatchEvent(new Event('journal-synced'))
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (needsLanPermission(e)) setPermissionNeeded(true)
      setPhase('invite')
      connection.current = undefined
      setToken('')
    } finally {
      exchanging.current = false
      onBusyChange(false)
    }
  }

  async function transferSpeech() {
    const download = window.api.sync.downloadSpeech
    if (!peer || !token || !speech || !download || exchanging.current || blocked) return
    connection.current = { peerId: peer.id, token }
    exchanging.current = true
    onBusyChange(true)
    setError('')
    setCode('')
    setSpeechProgress(undefined)
    setPhase('syncing')
    try {
      setSpeechResult(await download(peer, token, speech, (ready, available) => {
        setSpeechProgress({ ready, available })
      }))
      updateReaderPreferences({ enabled: true, provider: 'edge', voice: speech.voice })
      setPhase('done')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      if (needsLanPermission(e)) setPermissionNeeded(true)
      const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined
      if (code === 'LAN_AUTH_EXPIRED') {
        connection.current = undefined
        setToken('')
        setPhase('invite')
      } else {
        if (code === 'LAN_INTERRUPTED')
          setError('连接中断。确认电脑同步仍开启后，可继续下载。已保存的片段会保留。')
        setPhase('ready')
      }
    } finally {
      exchanging.current = false
      onBusyChange(false)
    }
  }

  async function allowLan() {
    if (!window.api.sync.requestLanPermission || permissionBusy) return
    setPermissionBusy(true)
    setPermissionMessage('')
    try {
      if (await window.api.sync.requestLanPermission()) {
        setPermissionNeeded(false)
        setDiscoveryError('')
        setError('')
        retryDiscovery((revision) => revision + 1)
      } else {
        setPermissionMessage('请在系统设置中允许此应用访问「附近设备」，再回来重试。')
      }
    } catch (e) {
      setPermissionMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPermissionBusy(false)
    }
  }

  const permissionControl = permissionNeeded && window.api.sync.requestLanPermission && (
    <>
      <button className="btn" disabled={permissionBusy} onClick={() => void allowLan()}>
        允许附近设备访问
      </button>
      {permissionMessage && <p role="status">{permissionMessage}</p>}
    </>
  )

  return (
    <>
      {settingsSlot &&
        createPortal(
          <section className="card mobile-sync-panel" aria-label="设备同步">
            <h2>设备同步</h2>
            {android ? (
              <>
                <p>在同一局域网的电脑上开启同步，手机会自动发现。打开篇目后，点击「下载朗读」接收电脑音频。</p>
                {devices.map((device) => (
                  <button
                    key={device.id}
                    className="btn btn-primary"
                    disabled={blocked || !!peer}
                    onClick={() => open(device)}
                  >
                    与 {device.name} 同步
                  </button>
                ))}
                {!devices.length && !discoveryError && <p role="status">正在查找电脑…</p>}
                {discoveryError && <p role="alert">{discoveryError}</p>}
                {!peer && permissionControl}
              </>
            ) : (
              <p>请在 Android APK 中使用局域网同步。</p>
            )}
          </section>,
          settingsSlot
        )}
      {(peer || speech) && (
        <dialog
          ref={dialog}
          className="mobile-sync-dialog"
          aria-labelledby="sync-title"
          onCancel={(event) => {
            event.preventDefault()
            close()
          }}
        >
          <h2 id="sync-title">{speech ? '从电脑下载朗读' : '与电脑同步'}</h2>
          {speech && (
            <p>《{speech.title}》 · {EDGE_VOICES.find((voice) => voice.id === speech.voice)?.label}</p>
          )}
          {peer && <p className="sync-device-name">{peer.name}</p>}
          {!peer && (
            <>
              <p>请在同一 Wi-Fi 的电脑上开启局域网同步，然后选择电脑。</p>
              {devices.map((device) => (
                <button key={device.id} className="btn" onClick={() => open(device)}>
                  连接 {device.name}
                </button>
              ))}
              {!devices.length && !discoveryError && <p role="status">正在查找电脑…</p>}
              {discoveryError && <p role="alert">{discoveryError}</p>}
            </>
          )}
          {peer && phase === 'invite' && (
            <p>
              {speech
                ? '配对后可下载电脑上已有的朗读音频。'
                : '发现已开启局域网同步的电脑。配对后可同步阅读与工作台问题、记录、待办和成就。'}
            </p>
          )}
          {(phase === 'pairing' || phase === 'ready') && (
            <div role="status">
              {code && <p className="mobile-sync-code">{code}</p>}
              <p>
                {phase === 'ready'
                  ? speech
                    ? code ? '确认两端数字一致后即可下载。' : '已连接电脑，可下载朗读音频。'
                    : code
                      ? '电脑已允许配对。请确认你在自己的电脑上看到了上方数字，然后选择同步规则。'
                      : '已连接电脑，请选择同步规则。'
                  : code
                    ? '请核对电脑弹窗上的 6 位数字，并在电脑上点击「允许同步」。'
                    : '正在与电脑建立连接…'}
              </p>
            </div>
          )}
          {!speech && phase === 'ready' && (
            <fieldset>
              <legend>同步规则</legend>
              {strategies.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name="sync-strategy"
                    checked={strategy === option.id}
                    onChange={() => setStrategy(option.id)}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.detail}</small>
                  </span>
                </label>
              ))}
              <p>两种覆盖方式都保留单边独有的记录。成就始终双向合并。</p>
            </fieldset>
          )}
          {speech && phase === 'ready' && <p>已下载片段可离线播放，其余片段使用系统语音。</p>}
          {phase === 'syncing' && (
            <p role="status">
              {speech
                ? speechProgress
                  ? `已准备 ${speechProgress.ready} / ${speechProgress.available} 个音频片段…`
                  : '正在读取电脑上的朗读清单…'
                : '正在同步记录、成就和附件…'}
            </p>
          )}
          {phase === 'done' && speechResult && (
            <p role="status">
              本机已保存 {speechResult.ready} / {speechResult.total} 个朗读片段。
              {speechResult.ready < speechResult.total ? '其余片段使用系统语音。' : '现在可以离线听完整篇。'}
            </p>
          )}
          {phase === 'done' && result && (
            <>
              <p role="status">
                本轮核对 {result.count} 项，{result.conflicts.length} 项冲突已保留两份。
                {result.achievements ? '成就已同步。' : '电脑未返回成就同步结果。'}
                附件已传输 {result.attachments?.transferred ?? 0} 个，待重试{' '}
                {result.attachments?.pending ?? 0} 个。
              </p>
              {result.attachments?.errors.map((message, index) => (
                <p key={index} role="alert">
                  {message}
                </p>
              ))}
              {result.conflicts.map(({ key, local, remote }) => (
                <details key={key}>
                  <summary>查看已保留的冲突版本</summary>
                  <h3>手机版本</h3>
                  <pre>{content(local)}</pre>
                  <h3>电脑版本</h3>
                  <pre>{content(remote)}</pre>
                </details>
              ))}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {permissionControl}
          <footer>
            {phase !== 'syncing' && (
              <button className="btn" onClick={close}>
                {phase === 'done' ? '完成' : '取消'}
              </button>
            )}
            {peer && phase === 'invite' && (
              <button className="btn btn-primary" disabled={blocked} onClick={() => void pair()}>
                请求配对
              </button>
            )}
            {phase === 'ready' && (
              <button
                className="btn btn-primary"
                disabled={blocked}
                onClick={() => void (speech ? transferSpeech() : sync())}
              >
                {speech
                  ? code
                    ? '确认数字一致并下载'
                    : error && speechProgress
                      ? '继续下载'
                      : '下载朗读'
                  : '确认数字一致并同步'}
              </button>
            )}
          </footer>
        </dialog>
      )}
    </>
  )
}
