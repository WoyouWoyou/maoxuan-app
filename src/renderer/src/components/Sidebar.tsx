import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  MODE_META,
  stepMeta,
  type SessionMode,
  type SessionSummary,
  type StepKey
} from '@shared/types'
import { CloseSessionDialog } from './CloseSessionDialog'
import './Sidebar.css'
import { useBooks } from '../features/library/useBooks'

const MIN_PROBLEM_LEN = 10
const COLLAPSE_KEY = 'maoxuan.sidebarCollapsed'
const MODES: SessionMode[] = ['reading', 'workbench']

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
  const books = useBooks()
  const [bookId, setBookId] = useState('maoxuan')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<SessionMode>('reading')
  const [problemText, setProblemText] = useState('')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [closing, setClosing] = useState<SessionSummary | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
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
    setCreateError(null)
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

  useEffect(() => {
    if (creating && !collapsed) textareaRef.current?.focus()
  }, [creating, collapsed])

  function cancelCreate() {
    setCreating(false)
    setProblemText('')
    setCreateError(null)
    setMode('reading')
  }

  async function submitCreate() {
    const text = problemText.trim()
    if (busy || text.length < MIN_PROBLEM_LEN) return
    setBusy(true)
    setCreateError(null)
    try {
      const session = await window.api.sessions.create(text, mode, bookId)
      setProblemText('')
      setCreating(false)
      setMode('reading')
      window.dispatchEvent(new Event('sessions-changed'))
      navigate(`/session/${session.id}`)
    } catch (e) {
      setCreateError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  function handleClosed(_action: 'trash' | 'archive') {
    const target = closing
    setClosing(null)
    if (target && target.id === activeId) navigate('/')
    window.dispatchEvent(new Event('sessions-changed'))
  }

  const canSubmit = problemText.trim().length >= MIN_PROBLEM_LEN && !busy

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
            title="我有一个头疼的问题"
            onClick={openNew}
          >
            ＋
          </button>

          <span className="spacer" />

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

        {creating ? (
          <div className="sb-new-box">
            <div className="sb-mode-row">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={m === mode ? 'sb-mode-opt is-on' : 'sb-mode-opt'}
                  disabled={busy}
                  onClick={() => setMode(m)}
                >
                  <span className="sb-mode-name">{MODE_META[m].name}</span>
                  <span className="sb-mode-desc">{MODE_META[m].desc}</span>
                </button>
              ))}
            </div>

            {mode === 'reading' && (
              <label className="field">
                选择书籍
                <select
                  className="input"
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                >
                  {books.map((b) => (
                    <option key={b.bookId} value={b.bookId}>
                      {b.title}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>
                  导入其他书籍
                </button>
              </label>
            )}
            <textarea
              ref={textareaRef}
              className="textarea sb-new-input"
              placeholder={
                mode === 'workbench'
                  ? '写出这个项目的主目标（至少 10 字），例如：三个月内把 AI 客服从试点推到全公司'
                  : '写出你最近最头疼的那一件事（至少 10 字）'
              }
              value={problemText}
              onChange={(e) => setProblemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelCreate()
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submitCreate()
              }}
            />
            <div className="sb-new-actions">
              <span className="sb-count muted">{problemText.trim().length}/10 字</span>
              <span className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={cancelCreate} disabled={busy}>
                取消
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => void submitCreate()}
                disabled={!canSubmit}
              >
                {busy ? <span className="spinner" /> : null}
                {mode === 'workbench' ? '建立项目' : '开始'}
              </button>
            </div>
            {createError ? <div className="error-text">{createError}</div> : null}
          </div>
        ) : (
          <button className="btn btn-primary sb-new" onClick={() => setCreating(true)}>
            ＋ 我有一个头疼的问题
          </button>
        )}
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

            <div className="sb-item-title">{s.title}</div>
            <div className="sb-item-meta">
              {s.mode === 'workbench' ? <span className="badge sb-mode-badge">工作台</span> : null}
              <span className="badge sb-badge">{stepLabel(s.currentStep)}</span>
              <span className="spacer" />
              <span className="sb-item-time">{formatTime(s.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>

      <nav className="sb-foot">
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
