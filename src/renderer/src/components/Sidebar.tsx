import { useFeaturePreferences } from '../features/settings/feature-preferences'
import { SquaresFour, Mountains, Notebook } from '@phosphor-icons/react'
import { useActionHub } from '../features/actions/context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { stepMeta, type SessionMode, type SessionSummary, type StepKey } from '@shared/types'
import { CloseSessionDialog } from './CloseSessionDialog'
import './Sidebar.css'
import { NewSessionDialog } from './NewSessionDialog'

import { sessionLabels, validSessionLabel } from '../lib/session-labels'

const LABELS_KEY = 'maoxuan.sidebarLabels'
function readLabels(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(LABELS_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : {}
  } catch {
    return {}
  }
}

function LabelDialog({
  session,
  label,
  onSave,
  onClose
}: {
  session: SessionSummary
  label: string
  onSave: (value: string) => string | null
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState(label)
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="sb-label-dialog"
      onCancel={onClose}
      aria-labelledby="sb-label-heading"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const message = onSave(value.trim())
          if (message) setError(message)
          else onClose()
        }}
      >
        <h3 id="sb-label-heading">修改问题标识</h3>
        <p>{session.title}</p>
        <label htmlFor="sb-label-input">输入 1～2 个字（汉字、字母或数字）</label>
        <input
          id="sb-label-input"
          autoFocus
          value={value}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
          }}
          aria-describedby={error ? 'sb-label-error' : undefined}
        />
        {error && (
          <p id="sb-label-error" className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="sb-label-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary">
            保存
          </button>
        </div>
      </form>
    </dialog>
  )
}

const COLLAPSE_KEY = 'maoxuan.sidebarCollapsed'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function stepLabel(step: StepKey): string {
  const found = stepMeta(step)
  return found ? `${found.no} ${found.name}` : step
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function Sidebar() {
  const features = useFeaturePreferences()
  const showMarch = features.loaded && features.preferences.longMarch
  const { tasks: actionTasks } = useActionHub()
  const pendingActions = actionTasks.filter((task) => task.status === 'todo').length
  const [bookId, setBookId] = useState('maoxuan')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<SessionMode>('reading')
  const [closing, setClosing] = useState<SessionSummary | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  const [customLabels, setCustomLabels] = useState(readLabels)
  const [editingLabel, setEditingLabel] = useState<SessionSummary | null>(null)
  const labels = useMemo(() => sessionLabels(sessions, customLabels), [sessions, customLabels])
  const labelDialog = editingLabel ? (
    <LabelDialog
      key={editingLabel.id}
      session={editingLabel}
      label={labels[editingLabel.id]}
      onClose={() => setEditingLabel(null)}
      onSave={(value) => {
        if (!validSessionLabel(value)) return '请输入 1～2 个字（汉字、字母或数字）。'
        if (
          sessions.some(
            (session) =>
              session.id !== editingLabel.id &&
              labels[session.id].toLocaleLowerCase() === value.toLocaleLowerCase()
          )
        )
          return '这个标识已被其他问题使用，请换一个。'
        const next = { ...customLabels, [editingLabel.id]: value }
        try {
          localStorage.setItem(LABELS_KEY, JSON.stringify(next))
        } catch {
          return '保存失败，请重试。'
        }
        setCustomLabels(next)
        return null
      }}
    />
  ) : null

  const navigate = useNavigate()
  const location = useLocation()

  const match = /^\/session\/([^/?#]+)/.exec(location.pathname)
  const activeId = match ? match[1] : null
  const onLibrary = location.pathname.startsWith('/library')
  const onSettings = location.pathname.startsWith('/settings')

  const persistCollapsed = useCallback((value: boolean) => {
    setCollapsed(value)
    try {
      localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0')
    } catch {
      // 本地存储不可用时忽略，仅本次会话生效
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const list = await window.api.sessions.list()
      setSessions(list)
      setError(null)
    } catch (e) {
      setError(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => {
      void load()
    }
    window.addEventListener('sessions-changed', handler)
    return () => window.removeEventListener('sessions-changed', handler)
  }, [load])

  const openNew = useCallback(() => {
    persistCollapsed(false)
    setCreating(true)
  }, [persistCollapsed])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.bookId) {
        setBookId(detail.bookId)
        setMode('reading')
      }
      openNew()
    }
    window.addEventListener('open-new-session', handler)
    return () => window.removeEventListener('open-new-session', handler)
  }, [openNew])

  function handleClosed(_action: 'trash' | 'archive') {
    const target = closing
    setClosing(null)
    if (target && target.id === activeId) navigate('/')
    window.dispatchEvent(new Event('sessions-changed'))
  }

  if (collapsed) {
    return (
      <aside className="sb is-collapsed">
        <div className="sb-rail">
          <button
            className="btn btn-ghost btn-sm sb-rail-btn"
            title="展开侧栏"
            onClick={() => persistCollapsed(false)}
          >
            »
          </button>
          <button
            className="btn btn-ghost btn-sm sb-rail-btn"
            title="新增一个头疼的问题"
            onClick={openNew}
          >
            ＋
          </button>

          <nav className="sb-rail-sessions" aria-label="问题列表">
            {loading && <span className="spinner" aria-label="正在加载问题" />}
            {error && (
              <button
                className="btn btn-ghost sb-rail-btn"
                title={`${error}，点击重试`}
                aria-label="加载问题失败，重试"
                onClick={() => void load()}
              >
                !
              </button>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`btn btn-ghost sb-rail-btn sb-session-label${session.id === activeId ? ' active' : ''}`}
                title={`${session.title}（右键修改标识）`}
                aria-label={session.title}
                aria-current={session.id === activeId ? 'page' : undefined}
                onClick={() => navigate(`/session/${session.id}`)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setEditingLabel(session)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'F2') {
                    event.preventDefault()
                    setEditingLabel(session)
                  }
                }}
              >
                {labels[session.id]}
              </button>
            ))}
          </nav>

          <NavLink
            to="/actions"
            className={({ isActive }) =>
              `btn btn-ghost btn-sm sb-rail-btn${isActive ? ' active' : ''}`
            }
            title="四象限工作法"
            aria-label="四象限工作法"
          >
            <SquaresFour size={18} />
          </NavLink>
          {showMarch && (
            <NavLink
              data-growth-target
              to="/long-march"
              className={({ isActive }) =>
                `btn btn-ghost btn-sm sb-rail-btn${isActive ? ' active' : ''}`
              }
              title="长征不怕远征难"
              aria-label="长征不怕远征难"
            >
              <Mountains size={18} />
            </NavLink>
          )}
          <NavLink
            to="/journal"
            className={({ isActive }) =>
              `btn btn-ghost btn-sm sb-rail-btn${isActive ? ' active' : ''}`
            }
            title="日常记录"
            aria-label="日常记录"
          >
            <Notebook size={18} />
          </NavLink>
          <button
            className={
              onLibrary
                ? 'btn btn-ghost btn-sm sb-rail-btn active'
                : 'btn btn-ghost btn-sm sb-rail-btn'
            }
            title="原文书库"
            onClick={() => navigate('/library')}
          >
            书
          </button>
          <button
            className={
              onSettings
                ? 'btn btn-ghost btn-sm sb-rail-btn active'
                : 'btn btn-ghost btn-sm sb-rail-btn'
            }
            title="设置"
            onClick={() => navigate('/settings')}
          >
            设
          </button>
        </div>
        {labelDialog}
      </aside>
    )
  }

  return (
    <aside className="sb">
      <div className="sb-head">
        <div className="sb-brand-row">
          <div className="sb-brand">
            <span className="sb-brand-name">毛选实用工具箱</span>
            <span className="sb-brand-sub">带着问题读，读完就能用</span>
          </div>
          <span className="spacer" />
          <button
            className="btn btn-ghost btn-sm sb-collapse"
            title="收起侧栏"
            onClick={() => persistCollapsed(true)}
          >
            «
          </button>
        </div>

        <button className="btn btn-primary sb-new" onClick={openNew}>
          ＋ 新增一个头疼的问题
        </button>
      </div>

      <div className="sb-list scroll">
        {loading && sessions.length === 0 ? (
          <div className="sb-empty">
            <span className="spinner" /> 正在加载…
          </div>
        ) : null}

        {!loading && sessions.length === 0 ? (
          <div className="sb-empty">还没有会话。先写下你最头疼的一件事。</div>
        ) : null}

        {error ? <div className="error-text sb-list-error">{error}</div> : null}

        {sessions.map((s) => (
          <div
            key={s.id}
            className={s.id === activeId ? 'sb-item active' : 'sb-item'}
            title={s.title}
            onClick={() => navigate(`/session/${s.id}`)}
            onContextMenu={(e) => {
              e.preventDefault()
              setClosing(s)
            }}
          >
            <button
              className="sb-item-close"
              title="关闭问题"
              onClick={(e) => {
                e.stopPropagation()
                setClosing(s)
              }}
            >
              ×
            </button>

            <div className="sb-item-title">
              <button
                className="sb-item-label"
                title="修改问题标识"
                aria-label={`修改「${s.title}」的问题标识`}
                onClick={(event) => {
                  event.stopPropagation()
                  setEditingLabel(s)
                }}
              >
                {labels[s.id]}
              </button>
              {s.title}
            </div>
            <div className="sb-item-meta">
              {s.mode === 'workbench' ? <span className="badge sb-mode-badge">工作台</span> : null}
              {s.mode !== 'workbench' && <span className="badge sb-badge">{stepLabel(s.currentStep)}</span>}
              <span className="spacer" />
              <span className="sb-item-time">{formatTime(s.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>

      <nav className="sb-foot">
        <NavLink
          className={({ isActive }) => `sb-nav sb-actions-nav${isActive ? ' active' : ''}`}
          to="/actions"
        >
          <SquaresFour size={18} weight="duotone" />
          四象限工作法
          {pendingActions > 0 && <span className="sb-actions-count">{pendingActions}</span>}
        </NavLink>
        {showMarch && (
          <NavLink
            data-growth-target
            to="/long-march"
            className={({ isActive }) => (isActive ? 'sb-nav active' : 'sb-nav')}
          >
            <Mountains size={18} weight="duotone" />
            长征不怕远征难
          </NavLink>
        )}
        <NavLink
          to="/journal"
          className={({ isActive }) => (isActive ? 'sb-nav active' : 'sb-nav')}
        >
          <Notebook size={18} weight="duotone" />
          日常记录
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? 'sb-nav active' : 'sb-nav')}
          to="/library"
        >
          原文书库
        </NavLink>
        <NavLink
          className={({ isActive }) => (isActive ? 'sb-nav active' : 'sb-nav')}
          to="/settings"
        >
          设置
        </NavLink>
      </nav>

      {labelDialog}

      {creating ? (
        <NewSessionDialog
          initialMode={mode}
          initialBookId={bookId}
          onClose={() => {
            setCreating(false)
            setMode('reading')
          }}
          onCreated={(id) => {
            setCreating(false)
            setMode('reading')
            window.dispatchEvent(new Event('sessions-changed'))
            navigate(`/session/${id}`)
          }}
          onImport={() => {
            setCreating(false)
            setMode('reading')
            navigate('/library')
          }}
        />
      ) : null}

      {closing ? (
        <CloseSessionDialog
          session={closing}
          onClose={() => setClosing(null)}
          onDone={handleClosed}
        />
      ) : null}
    </aside>
  )
}
