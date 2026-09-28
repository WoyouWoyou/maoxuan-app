import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Diagnosis, ProblemInput, Reading, Session, SessionData, SessionPatch, StepKey } from '@shared/types'
import { STEPS } from '@shared/types'
import { ChatPanel } from '@renderer/components/ChatPanel'
import { DontsTicker } from '@renderer/components/DontsTicker'
import { ReviseDialog } from '@renderer/components/ReviseDialog'
import { Stepper } from '@renderer/components/Stepper'
import { VersionPanel } from '@renderer/components/VersionPanel'
import { StepApply } from '@renderer/components/steps/StepApply'
import { StepFocus } from '@renderer/components/steps/StepFocus'
import { StepProblem } from '@renderer/components/steps/StepProblem'
import { StepRelate } from '@renderer/components/steps/StepRelate'
import { stepUnlocked } from '@renderer/components/steps/types'
import { WorkbenchPage } from './WorkbenchPage'
import './SessionPage.css'

const ORDER: StepKey[] = ['problem', 'focus', 'relate', 'apply']

function orderOf(step: StepKey): number {
  return ORDER.indexOf(step)
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function makeReading(articleId: string, title: string, focusQuestion = ''): Reading {
  return {
    articleId,
    title,
    startedAt: new Date().toISOString(),
    focusQuestion,
    passages: [],
    reflections: [],
    readDone: false,
    notes: { coreMethod: '', relatedProblem: '', action: '' },
    feedback: null,
    notesDone: false
  }
}

export function SessionPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const navigate = useNavigate()
  const location = useLocation()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [viewStep, setViewStep] = useState<StepKey>('problem')
  const [focusArticleId, setFocusArticleId] = useState<string | null>(null)
  const [scrollToParagraph, setScrollToParagraph] = useState<number | null>(null)
  const [panelTab, setPanelTab] = useState<'chat' | 'version'>('chat')
  const [collapsed, setCollapsed] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [reviseOpen, setReviseOpen] = useState(false)
  const handledFocus = useRef('')

  // 最新会话快照 + 串行写入队列：AI 调用期间用户的其他改动不会被旧数据覆盖
  const sessionRef = useRef<Session | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const idRef = useRef(id)

  const applySession = useCallback((next: Session) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task)
    queueRef.current = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }, [])

  const commit = useCallback(
    async (patch: SessionPatch, versionLabel?: string): Promise<Session | null> => {
      setSaveError('')
      try {
        return await enqueue(async () => {
          const updated = await window.api.sessions.update(id, patch, versionLabel)
          if (idRef.current === id) applySession(updated)
          window.dispatchEvent(new Event('sessions-changed'))
          return updated
        })
      } catch (e) {
        setSaveError(toMessage(e))
        return null
      }
    },
    [applySession, enqueue, id]
  )

  const save = useCallback(
    async (data: SessionData, opts?: { versionLabel?: string; step?: StepKey }) => {
      const patch: SessionPatch = { data }
      if (opts?.step) patch.currentStep = opts.step
      await commit(patch, opts?.versionLabel)
    },
    [commit]
  )

  const update = useCallback(
    async (fn: (latest: SessionData) => SessionData, opts?: { versionLabel?: string; step?: StepKey }) => {
      setSaveError('')
      try {
        await enqueue(async () => {
          const latest = sessionRef.current?.data
          if (!latest) return
          const patch: SessionPatch = { data: fn(latest) }
          if (opts?.step) patch.currentStep = opts.step
          const next = await window.api.sessions.update(id, patch, opts?.versionLabel)
          if (idRef.current === id) applySession(next)
          window.dispatchEvent(new Event('sessions-changed'))
        })
      } catch (e) {
        setSaveError(toMessage(e))
      }
    },
    [applySession, enqueue, id]
  )

  useEffect(() => {
    let alive = true
    handledFocus.current = ''
    idRef.current = id
    sessionRef.current = null
    queueRef.current = Promise.resolve()
    setLoading(true)
    setLoadError('')
    setSaveError('')
    setSession(null)
    setViewStep('problem')
    setFocusArticleId(null)
    setScrollToParagraph(null)
    setReviseOpen(false)
    void (async () => {
      try {
        const loaded = await window.api.sessions.get(id)
        if (!alive) return
        if (!loaded) {
          setLoadError('会话不存在或已被删除')
          return
        }
        applySession(loaded)
        setViewStep(loaded.currentStep)
        setFocusArticleId(loaded.data.readings[0]?.articleId ?? null)
      } catch (e) {
        if (alive) setLoadError(toMessage(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id, applySession])

  const goStep = useCallback(
    (step: StepKey) => {
      setViewStep(step)
      const current = sessionRef.current
      if (current && orderOf(step) > orderOf(current.currentStep)) {
        void commit({ currentStep: step })
      }
    },
    [commit]
  )

  const openReader = useCallback((articleId: string, paragraph?: number) => {
    setFocusArticleId(articleId)
    setViewStep('focus')
    if (typeof paragraph === 'number') {
      // 先清空再设置，保证点击同一段落第二次也能触发滚动
      setScrollToParagraph(null)
      window.setTimeout(() => setScrollToParagraph(paragraph), 0)
    }
  }, [])

  const openRevise = useCallback(() => {
    setReviseOpen(true)
  }, [])

  const closeRevise = useCallback(() => {
    setReviseOpen(false)
  }, [])

  const handleReviseApply = useCallback(
    async (next: { problem: ProblemInput; diagnosis: Diagnosis }) => {
      await update(latest => ({ ...latest, problem: next.problem, diagnosis: next.diagnosis }), {
        versionLabel: '第一步：根据讨论修订'
      })
      setReviseOpen(false)
      setViewStep('problem')
    },
    [update]
  )

  const handleSelectStep = useCallback(
    (step: StepKey) => {
      if (!session) return
      if (!stepUnlocked(session.data, step).ok) return
      setViewStep(step)
    },
    [session]
  )

  const handleRestored = useCallback(
    (restored: Session) => {
      applySession(restored)
      setViewStep(restored.currentStep)
      window.dispatchEvent(new Event('sessions-changed'))
    },
    [applySession]
  )

  // 从书库带 ?focus=articleId 进入：加入 readings 并跳到第二步
  useEffect(() => {
    if (!session) return
    const articleId = new URLSearchParams(location.search).get('focus')
    if (!articleId) return
    const key = `${session.id}:${articleId}`
    if (handledFocus.current === key) return
    handledFocus.current = key
    let alive = true
    void (async () => {
      try {
        const article = await window.api.articles.get(articleId)
        if (!alive) return
        if (!article) {
          navigate(location.pathname, { replace: true })
          return
        }
        setFocusArticleId(articleId)
        setViewStep('focus')
        const already = (sessionRef.current ?? session).data.readings.some(r => r.articleId === articleId)
        const stepPatch: StepKey | undefined = orderOf('focus') > orderOf(session.currentStep) ? 'focus' : undefined
        if (already) {
          if (stepPatch) await commit({ currentStep: stepPatch })
        } else {
          await update(
            latest =>
              latest.readings.some(r => r.articleId === articleId)
                ? latest
                : { ...latest, readings: [...latest.readings, makeReading(article.id, article.title)] },
            { versionLabel: `从书库加入《${article.title}》`, step: stepPatch }
          )
        }
        if (!alive) return
        navigate(location.pathname, { replace: true })
      } catch (e) {
        if (alive) setSaveError(toMessage(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [session, location.search, location.pathname, navigate, update, commit])

  async function commitTitle() {
    if (!session) return
    setRenaming(false)
    const next = titleDraft.trim()
    if (!next || next === session.title) return
    await commit({ title: next })
  }

  if (loading) {
    return (
      <div className="sp-root">
        <div className="empty">
          <span className="spinner" /> 正在打开会话…
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="sp-root">
        <div className="empty">
          <div className="error-text">{loadError || '会话不存在或已被删除'}</div>
        </div>
      </div>
    )
  }

  if (session.mode === 'workbench') return <WorkbenchPage key={session.id} initial={session} />

  const currentStepName = STEPS.find(s => s.key === session.currentStep)?.name ?? ''
  const chatArticleId = viewStep === 'focus' || viewStep === 'relate' ? focusArticleId : null
  const stepProps = {
    session,
    save,
    update,
    goStep,
    openReader,
    focusArticleId,
    setFocusArticleId,
    scrollToParagraph,
    openRevise
  }

  return (
    <div className="sp-root">
      <div className="sp-main">
        <header className="sp-header">
          {renaming ? (
            <input
              className="input sp-title-input"
              value={titleDraft}
              autoFocus
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setTitleDraft(session.title)
                  setRenaming(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="sp-title"
              title="点击重命名"
              onClick={() => {
                setTitleDraft(session.title)
                setRenaming(true)
              }}
            >
              {session.title}
            </button>
          )}
          <div className="sp-sub muted">
            当前进度：第 {STEPS.find(s => s.key === session.currentStep)?.no ?? 1} 步 · {currentStepName} · 共 {session.versionNo} 个版本快照
          </div>
        </header>

        <Stepper currentStep={session.currentStep} viewStep={viewStep} data={session.data} onSelect={handleSelectStep} />

        {saveError && <div className="error-text sp-errorbar">保存失败：{saveError}</div>}

        <div className="sp-step">
          {viewStep === 'problem' && <StepProblem {...stepProps} />}
          {viewStep === 'focus' && <StepFocus {...stepProps} />}
          {viewStep === 'relate' && <StepRelate {...stepProps} />}
          {viewStep === 'apply' && <StepApply {...stepProps} />}
        </div>

        <DontsTicker />
      </div>

      <aside className={collapsed ? 'sp-panel is-collapsed' : 'sp-panel'}>
        {collapsed ? (
          <button type="button" className="sp-panel-toggle" title="展开右侧面板" onClick={() => setCollapsed(false)}>
            <span className="sp-panel-toggle-text">教练对话 · 版本历史</span>
          </button>
        ) : (
          <>
            <div className="sp-panel-head">
              <div className="sp-tabs">
                <button type="button" className={panelTab === 'chat' ? 'is-on' : ''} onClick={() => setPanelTab('chat')}>
                  教练对话
                </button>
                <button type="button" className={panelTab === 'version' ? 'is-on' : ''} onClick={() => setPanelTab('version')}>
                  版本历史
                </button>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" title="折叠" onClick={() => setCollapsed(true)}>
                »
              </button>
            </div>
            <div className="sp-panel-body">
              {panelTab === 'chat' ? (
                <ChatPanel sessionId={session.id} articleId={chatArticleId} onApplyToProblem={openRevise} />
              ) : (
                <VersionPanel
                  sessionId={session.id}
                  currentData={session.data}
                  versionNo={session.versionNo}
                  onRestored={handleRestored}
                />
              )}
            </div>
          </>
        )}
      </aside>

      {reviseOpen && <ReviseDialog session={session} onClose={closeRevise} onApply={handleReviseApply} />}
    </div>
  )
}
