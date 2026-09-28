import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STEPS, type Session, type SessionData, type Version, type VersionSummary } from '@shared/types'
import { diffData, labelOfPath } from '../lib/diff'
import './VersionPanel.css'

export interface VersionPanelProps {
  sessionId: string
  currentData: SessionData
  /** 变化时重新拉取版本列表 */
  versionNo: number
  onRestored: (s: Session) => void
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function stepName(key: string): string {
  const found = STEPS.find((s) => s.key === key)
  return found ? `${found.no} ${found.name}` : key
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const delta = Date.now() - t
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function Snapshot({ data }: { data: SessionData }) {
  const doneCount = data.actions.filter((a) => a.status === 'done').length
  const readingsText =
    data.readings.length === 0
      ? '（无）'
      : data.readings.map((r) => `${r.title}${r.notesDone ? '（已写笔记）' : '（未写笔记）'}`).join('、')
  const mindsetText = data.mindset
    ? `${data.mindset.mainContradiction}；${data.mindset.stage}；${data.mindset.firstStep}`
    : '（未生成）'

  return (
    <div className="ver-snapshot">
      <div className="ver-snap-row">
        <span className="ver-snap-label">问题</span>
        <span className="ver-snap-value">{data.problem.text || '（空）'}</span>
      </div>
      <div className="ver-snap-row">
        <span className="ver-snap-label">主要矛盾</span>
        <span className="ver-snap-value">{data.diagnosis?.mainContradiction || '（未诊断）'}</span>
      </div>
      <div className="ver-snap-row">
        <span className="ver-snap-label">已读篇目</span>
        <span className="ver-snap-value">{readingsText}</span>
      </div>
      <div className="ver-snap-row">
        <span className="ver-snap-label">行动</span>
        <span className="ver-snap-value">{`共 ${data.actions.length} 项，已完成 ${doneCount} 项`}</span>
      </div>
      <div className="ver-snap-row">
        <span className="ver-snap-label">心法</span>
        <span className="ver-snap-value">{mindsetText}</span>
      </div>
    </div>
  )
}

function DiffView({ oldData, newData }: { oldData: SessionData; newData: SessionData }) {
  const diffs = useMemo(() => diffData(oldData, newData), [oldData, newData])
  const [expanded, setExpanded] = useState<string[]>([])

  const toggle = (key: string) =>
    setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const renderValue = (text: string | undefined, key: string) => {
    const full = text ?? ''
    const needsMore = full.length > 120
    const open = expanded.includes(key)
    return (
      <span className="ver-diff-text">
        {full.length === 0 ? '（空）' : needsMore && !open ? `${full.slice(0, 120)}…` : full}
        {needsMore && (
          <button type="button" className="ver-diff-more" onClick={() => toggle(key)}>
            {open ? '收起' : '展开'}
          </button>
        )}
      </span>
    )
  }

  if (diffs.length === 0) return <div className="empty ver-empty-diff">与当前一致</div>

  return (
    <div className="ver-diff">
      {diffs.map((d) => (
        <div key={`${d.path}-${d.kind}`} className={`ver-diff-row ver-diff-${d.kind}`}>
          <div className="ver-diff-label">{labelOfPath(d.path)}</div>
          <div className="ver-diff-body">
            {d.kind === 'changed' && (
              <>
                <span className="ver-diff-before">{renderValue(d.before, `${d.path}:b`)}</span>
                <span className="ver-diff-arrow">→</span>
                <span className="ver-diff-after">{renderValue(d.after, `${d.path}:a`)}</span>
              </>
            )}
            {d.kind === 'added' && <span className="ver-diff-after">{renderValue(d.after, `${d.path}:a`)}</span>}
            {d.kind === 'removed' && <span className="ver-diff-before">{renderValue(d.before, `${d.path}:b`)}</span>}
          </div>
        </div>
      ))}
      <div className="ver-diff-summary muted">共 {diffs.length} 处差异（从该版本到当前）</div>
    </div>
  )
}

export function VersionPanel({ sessionId, currentData, versionNo, onRestored }: VersionPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Version | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [tab, setTab] = useState<'snapshot' | 'diff'>('snapshot')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const sessionRef = useRef(sessionId)
  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])

  const load = useCallback(async () => {
    const sid = sessionId
    setLoading(true)
    try {
      const list = await window.api.versions.list(sid)
      if (sessionRef.current !== sid) return
      setVersions([...list].sort((a, b) => b.versionNo - a.versionNo))
      setError('')
    } catch (e) {
      if (sessionRef.current !== sid) return
      setError(errorText(e))
    } finally {
      if (sessionRef.current === sid) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    setOpenId(null)
    setDetail(null)
    setConfirmId(null)
    setTab('snapshot')
    setVersions([])
    setError('')
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load, versionNo])

  useEffect(() => {
    if (!openId) {
      setDetail(null)
      return
    }
    let alive = true
    setDetailLoading(true)
    window.api.versions
      .get(openId)
      .then((v) => {
        if (!alive) return
        setDetail(v)
        setDetailLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(errorText(e))
        setDetailLoading(false)
      })
    return () => {
      alive = false
    }
  }, [openId])

  const toggleOpen = (v: VersionSummary) => {
    setConfirmId(null)
    if (openId === v.id) {
      setOpenId(null)
      return
    }
    setOpenId(v.id)
    setTab('snapshot')
  }

  const doRestore = async (v: VersionSummary) => {
    setRestoring(true)
    setError('')
    try {
      const session = await window.api.versions.restore(v.id)
      setConfirmId(null)
      onRestored(session)
      window.dispatchEvent(new Event('sessions-changed'))
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setRestoring(false)
    }
  }

  const latestNo = versions.length > 0 ? versions[0].versionNo : versionNo

  return (
    <div className="ver-panel">
      <div className="ver-head">
        <div className="ver-title">版本历史</div>
        <div className="ver-tip muted">
          每一次关键动作都会留下版本，可随时对比与恢复，恢复不会删除任何历史。
        </div>
      </div>

      <div className="ver-list scroll">
        {error && <div className="error-text ver-error">{error}</div>}
        {loading && versions.length === 0 && (
          <div className="empty">
            <span className="spinner" /> 加载版本…
          </div>
        )}
        {!loading && versions.length === 0 && <div className="empty">还没有版本记录</div>}

        {versions.map((v) => {
          const isCurrent = v.versionNo === latestNo
          const open = openId === v.id
          return (
            <div key={v.id} className={`ver-item${open ? ' ver-item-open' : ''}`}>
              <button type="button" className="ver-item-head" onClick={() => toggleOpen(v)}>
                <span className="ver-no">v{v.versionNo}</span>
                <span className="badge ver-step">{stepName(v.step)}</span>
                <span className="ver-label">{v.label}</span>
                {isCurrent && <span className="badge badge-ok">当前</span>}
                <span className="spacer" />
                <span className="ver-time muted">{relativeTime(v.createdAt)}</span>
              </button>

              {open && (
                <div className="ver-detail">
                  <div className="ver-tabs">
                    <button
                      type="button"
                      className={`ver-tab${tab === 'snapshot' ? ' ver-tab-on' : ''}`}
                      onClick={() => setTab('snapshot')}
                    >
                      快照
                    </button>
                    <button
                      type="button"
                      className={`ver-tab${tab === 'diff' ? ' ver-tab-on' : ''}`}
                      onClick={() => setTab('diff')}
                    >
                      与当前对比
                    </button>
                  </div>

                  {detailLoading ? (
                    <div className="empty">
                      <span className="spinner" /> 加载快照…
                    </div>
                  ) : detail ? (
                    tab === 'snapshot' ? (
                      <Snapshot data={detail.data} />
                    ) : (
                      <DiffView key={detail.id} oldData={detail.data} newData={currentData} />
                    )
                  ) : (
                    <div className="empty">快照加载失败</div>
                  )}

                  {!isCurrent && (
                    <div className="ver-restore">
                      {confirmId === v.id ? (
                        <div className="ver-confirm">
                          <span className="muted">恢复后当前内容会被该版本覆盖，历史版本仍会保留。确定恢复？</span>
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={restoring}
                              onClick={() => void doRestore(v)}
                            >
                              {restoring ? '恢复中…' : '确定恢复'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              disabled={restoring}
                              onClick={() => setConfirmId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(v.id)}>
                          恢复到此版本
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
