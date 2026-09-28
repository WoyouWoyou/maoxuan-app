import { useCallback, useMemo, useRef, useState } from 'react'
import type { Session, SessionPatch, StepKey, WbStepKey, WorkbenchData } from '@shared/types'
import { WB_STEPS, emptyWorkbench } from '@shared/types'
import type { WbSourceArea } from '@shared/workbench'
import { isAssumptionDraft, wbStepDone, wbStepUnlocked } from '@shared/workbench'
import { ChatPanel } from '@renderer/components/ChatPanel'
import { VersionPanel } from '@renderer/components/VersionPanel'
import { SourceDrawer } from '@renderer/components/workbench/SourceDrawer'
import { WbActStep } from '@renderer/components/workbench/WbActStep'
import { WbDecideStep } from '@renderer/components/workbench/WbDecideStep'
import { WbDiagnoseStep } from '@renderer/components/workbench/WbDiagnoseStep'
import { WbIntakeStep } from '@renderer/components/workbench/WbIntakeStep'
import { toMessage, type WbSaveOpts, type WbStepProps } from '@renderer/components/workbench/types'
import './SessionPage.css'
import './WorkbenchPage.css'

const ORDER: WbStepKey[] = ['wb_intake', 'wb_diagnose', 'wb_decide', 'wb_act']

const WB_CHAT_INTRO = {
  title: '我是这个项目的参谋。',
  desc: '先分清事实、判断和愿望，再谈怎么打。说出新情况时，记得补进事实台账或复盘。'
}

const WB_CHAT_QUESTIONS = ['我现在最该先打哪一仗？', '哪条事实最需要我去核实？', '什么信号出现就该换路线？']

function asWbStep(step: StepKey): WbStepKey {
  return ORDER.includes(step as WbStepKey) ? (step as WbStepKey) : 'wb_intake'
}

function orderOf(step: WbStepKey): number {
  return ORDER.indexOf(step)
}

interface WbStepperProps {
  currentStep: WbStepKey
  viewStep: WbStepKey
  wb: WorkbenchData
  onSelect: (step: WbStepKey) => void
}

function WbStepper({ currentStep, viewStep, wb, onSelect }: WbStepperProps) {
  return (
    <div className="stepper">
      {WB_STEPS.map(step => {
        const unlocked = wbStepUnlocked(wb, step.key)
        const done = wbStepDone(wb, step.key)
        const classes = ['stepper-item']
        if (step.key === viewStep) classes.push('is-active')
        if (done) classes.push('is-done')
        if (!unlocked.ok) classes.push('is-locked')
        if (step.key === currentStep) classes.push('is-current')
        return (
          <button
            key={step.key}
            type="button"
            className={classes.join(' ')}
            disabled={!unlocked.ok}
            title={unlocked.ok ? step.hint : unlocked.reason}
            onClick={() => onSelect(step.key)}
          >
            <span className="stepper-no">{done ? '✓' : step.no}</span>
            <span className="stepper-body">
              <span className="stepper-name">{step.name}</span>
              <span className="stepper-hint">{step.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface WorkbenchPageProps {
  initial: Session
}

export function WorkbenchPage({ initial }: WorkbenchPageProps) {
  const id = initial.id

  const [session, setSession] = useState<Session>(initial)
  const [saveError, setSaveError] = useState('')
  const [viewStep, setViewStep] = useState<WbStepKey>(asWbStep(initial.currentStep))
  const [panelTab, setPanelTab] = useState<'chat' | 'version'>('chat')
  const [collapsed, setCollapsed] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [sourceArea, setSourceArea] = useState<WbSourceArea | null>(null)

  // 最新会话快照 + 串行写入队列：AI 调用期间用户的其他改动不会被旧数据覆盖
  const sessionRef = useRef<Session>(initial)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())

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
    async (patch: SessionPatch, versionLabel?: string): Promise<Session> => {
      setSaveError('')
      return enqueue(async () => {
        const updated = await window.api.sessions.update(id, patch, versionLabel)
        applySession(updated)
        window.dispatchEvent(new Event('sessions-changed'))
        return updated
      }).catch((e: unknown) => {
        setSaveError(toMessage(e))
        throw e
      })
    },
    [applySession, enqueue, id]
  )

  const updateWb = useCallback(
    async (fn: (latest: WorkbenchData) => WorkbenchData, opts?: WbSaveOpts): Promise<void> => {
      setSaveError('')
      await enqueue(async () => {
        const data = sessionRef.current.data
        const wb = data.workbench ?? emptyWorkbench()
        const patch: SessionPatch = { data: { ...data, workbench: fn(wb) } }
        if (opts?.step) patch.currentStep = opts.step
        const updated = await window.api.sessions.update(id, patch, opts?.versionLabel)
        applySession(updated)
        window.dispatchEvent(new Event('sessions-changed'))
      }).catch((e: unknown) => {
        setSaveError(toMessage(e))
        throw e
      })
    },
    [applySession, enqueue, id]
  )

  const goStep = useCallback(
    (step: WbStepKey) => {
      setViewStep(step)
      const current = sessionRef.current
      if (orderOf(step) > orderOf(asWbStep(current.currentStep))) {
        void commit({ currentStep: step }).catch(() => undefined)
      }
    },
    [commit]
  )

  const openSource = useCallback((area: WbSourceArea) => {
    setSourceArea(area)
  }, [])

  const closeSource = useCallback(() => {
    setSourceArea(null)
  }, [])

  const handleRestored = useCallback(
    (restored: Session) => {
      applySession(restored)
      setViewStep(asWbStep(restored.currentStep))
      window.dispatchEvent(new Event('sessions-changed'))
    },
    [applySession]
  )

  const wb = useMemo(() => session.data.workbench ?? emptyWorkbench(), [session])

  async function commitTitle() {
    setRenaming(false)
    const next = titleDraft.trim()
    if (!next || next === session.title) return
    await commit({ title: next }).catch(() => undefined)
  }

  const currentMeta = WB_STEPS.find(s => s.key === asWbStep(session.currentStep))
  const assumptionDraft = wb.intake !== null && isAssumptionDraft(wb)

  const stepProps: WbStepProps = {
    session,
    wb,
    updateWb,
    goStep,
    openSource
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
          <div className="sp-sub muted wbp-sub">
            <span>
              毛选工作台 · 第 {currentMeta?.no ?? 1} 步 · {currentMeta?.name ?? ''} · 共 {session.versionNo} 个版本快照
            </span>
            {assumptionDraft ? (
              <span className="badge badge-red" title="追问未答完或没有已确认事实，结论依赖假设">
                假设版
              </span>
            ) : null}
          </div>
        </header>

        <WbStepper
          currentStep={asWbStep(session.currentStep)}
          viewStep={viewStep}
          wb={wb}
          onSelect={step => {
            if (!wbStepUnlocked(wb, step).ok) return
            setViewStep(step)
          }}
        />

        {saveError && <div className="error-text sp-errorbar">保存失败：{saveError}</div>}

        <div className="sp-step">
          {viewStep === 'wb_intake' && <WbIntakeStep {...stepProps} />}
          {viewStep === 'wb_diagnose' && <WbDiagnoseStep {...stepProps} />}
          {viewStep === 'wb_decide' && <WbDecideStep {...stepProps} />}
          {viewStep === 'wb_act' && <WbActStep {...stepProps} />}
        </div>
      </div>

      <aside className={collapsed ? 'sp-panel is-collapsed' : 'sp-panel'}>
        {collapsed ? (
          <button type="button" className="sp-panel-toggle" title="展开右侧面板" onClick={() => setCollapsed(false)}>
            <span className="sp-panel-toggle-text">参谋对话 · 版本历史</span>
          </button>
        ) : (
          <>
            <div className="sp-panel-head">
              <div className="sp-tabs">
                <button type="button" className={panelTab === 'chat' ? 'is-on' : ''} onClick={() => setPanelTab('chat')}>
                  参谋对话
                </button>
                <button
                  type="button"
                  className={panelTab === 'version' ? 'is-on' : ''}
                  onClick={() => setPanelTab('version')}
                >
                  版本历史
                </button>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" title="折叠" onClick={() => setCollapsed(true)}>
                »
              </button>
            </div>
            <div className="sp-panel-body">
              {panelTab === 'chat' ? (
                <ChatPanel
                  sessionId={session.id}
                  articleId={null}
                  title="参谋对话"
                  intro={WB_CHAT_INTRO}
                  quickQuestions={WB_CHAT_QUESTIONS}
                />
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

      {sourceArea ? <SourceDrawer area={sourceArea} onClose={closeSource} /> : null}
    </div>
  )
}
