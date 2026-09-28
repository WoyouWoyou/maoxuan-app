import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArticleReader } from '../components/ArticleReader'
import { stepMeta, type Article, type SessionSummary, type StepKey } from '@shared/types'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function stepName(step: StepKey): string {
  const found = stepMeta(step)
  return found ? `${found.no} ${found.name}` : step
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function LibraryArticlePage() {
  const { articleId } = useParams<{ articleId: string }>()
  const navigate = useNavigate()

  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [picking, setPicking] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

  useEffect(() => {
    if (!articleId) {
      setLoading(false)
      setError('缺少文章 ID')
      return
    }
    let alive = true
    setLoading(true)
    window.api.articles
      .get(articleId)
      .then((a) => {
        if (!alive) return
        setArticle(a)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(errText(e))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [articleId])

  async function openPicker() {
    setPicking(true)
    setPickerLoading(true)
    setPickerError(null)
    try {
      const list = await window.api.sessions.list()
      setSessions(list.filter((s) => s.status === 'active' && s.mode === 'reading'))
    } catch (e) {
      setPickerError(errText(e))
    } finally {
      setPickerLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="lart">
        <div className="empty">
          <span className="spinner" /> 正在加载原文…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="lart">
        <div className="error-text">{error}</div>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="lart">
        <div className="empty">没有找到这篇文章。</div>
      </div>
    )
  }

  return (
    <div className="lart">
      <div className="lart-head">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>
          ← 返回书库
        </button>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => void openPicker()}>
          用它解决我的问题
        </button>
      </div>

      {picking ? (
        <div className="card lart-picker">
          {pickerLoading ? (
            <div className="muted">
              <span className="spinner" /> 正在读取会话…
            </div>
          ) : null}
          {pickerError ? <div className="error-text">{pickerError}</div> : null}

          {!pickerLoading && !pickerError && sessions.length === 0 ? (
            <div className="col">
              <div className="muted">还没有阅读法会话。先写下你最头疼的一件事，再回来读这篇文章。</div>
              <div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    navigate('/')
                    window.dispatchEvent(new Event('open-new-session'))
                  }}
                >
                  ＋ 我有一个头疼的问题
                </button>
              </div>
            </div>
          ) : null}

          {sessions.length > 0 ? (
            <>
              <div className="lart-picker-label">选择要解决这件事的会话：</div>
              <div className="lart-session-list">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="lart-session"
                    onClick={() => navigate(`/session/${s.id}?focus=${article.id}`)}
                  >
                    <div className="lart-session-title">{s.title}</div>
                    <div className="lart-session-meta">
                      {stepName(s.currentStep)} · {formatTime(s.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="row lart-close-row">
            <button className="btn btn-sm btn-ghost" onClick={() => setPicking(false)}>
              收起
            </button>
          </div>
        </div>
      ) : null}

      <div className="lart-body">
        <ArticleReader article={article} />
      </div>
    </div>
  )
}
