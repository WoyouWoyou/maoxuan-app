import { useSessionMutations } from '@renderer/features/sessions/useSessionMutations'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { Session, SessionMetadataPatch, WorkbenchData } from '@shared/types'
import { emptyWorkbench } from '@shared/types'
import type { WorkbenchCommand } from '@shared/contracts/workbench'
import type { WbSourceArea } from '@shared/workbench'
import { ChatPanel } from '@renderer/components/ChatPanel'
import { VersionPanel } from '@renderer/components/VersionPanel'
import { SourceDrawer } from '@renderer/components/workbench/SourceDrawer'
import { WbThinkingFlow } from '@renderer/components/workbench/WbThinkingFlow'
import { toMessage, type WbSaveOpts } from '@renderer/components/workbench/types'
import './SessionPage.css'
import './WorkbenchPage.css'

const WB_CHAT_INTRO = {
  title: '一起把问题想清楚。',
  desc: '围绕你的处境和当前分析，找关键卡点、核实事实、讨论下一步。'
}
const WB_CHAT_QUESTIONS = [
  '为什么这是主要矛盾？',
  '我有没有把愿望当成客观条件？',
  '今天最值得先做哪一步？'
]

export interface WorkbenchPageProps {
  initial: Session
}

export function WorkbenchPage({ initial }: WorkbenchPageProps) {
  const id = initial.id

  const [session, setSession] = useState<Session>(initial)
  const [saveError, setSaveError] = useState('')
  const [restoreKey, setRestoreKey] = useState(0)
  const [panelTab, setPanelTab] = useState<'chat' | 'version'>('chat')
  const [collapsed, setCollapsed] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [sourceArea, setSourceArea] = useState<WbSourceArea | null>(null)

  // 最新会话快照 + 串行写入队列：AI 调用期间用户的其他改动不会被旧数据覆盖
  const sessionRef = useRef<Session>(initial)

  const applySession = useCallback((next: Session) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const {
    metadata,
    workbench: writeWorkbench,
    applyWorkbench
  } = useSessionMutations(id, sessionRef, applySession)
  const commit = useCallback(
    async (patch: SessionMetadataPatch, versionLabel?: string): Promise<Session> => {
      setSaveError('')
      try {
        return await metadata(patch, versionLabel)
      } catch (e) {
        setSaveError(toMessage(e))
        throw e
      }
    },
    [metadata]
  )
  const updateWb = useCallback(
    async (fn: (latest: WorkbenchData) => WorkbenchData, opts?: WbSaveOpts): Promise<void> => {
      setSaveError('')
      try {
        await writeWorkbench(fn, opts)
      } catch (e) {
        setSaveError(toMessage(e))
        throw e
      }
    },
    [writeWorkbench]
  )
  const submitWorkbench = useCallback(
    async (commands: WorkbenchCommand[], opts?: WbSaveOpts): Promise<void> => {
      setSaveError('')
      try {
        await applyWorkbench(commands, opts)
      } catch (e) {
        setSaveError(toMessage(e))
        throw e
      }
    },
    [applyWorkbench]
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
      setRestoreKey((key) => key + 1)
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

  return (
    <div className="sp-root">
      <div className="sp-main">
        <header className="sp-header">
          {renaming ? (
            <input
              className="input sp-title-input"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
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
            <span>毛选工作台 · 两个思考框架 · 共 {session.versionNo} 个版本快照</span>
          </div>
        </header>

        {saveError && <div className="error-text sp-errorbar">保存失败：{saveError}</div>}

        <div className="sp-step">
          <WbThinkingFlow
            key={restoreKey}
            session={session}
            wb={wb}
            updateWb={updateWb}
            applyWorkbench={submitWorkbench}
            openSource={openSource}
          />
        </div>
      </div>

      <aside className={collapsed ? 'sp-panel is-collapsed' : 'sp-panel'}>
        {collapsed ? (
          <button
            type="button"
            className="sp-panel-toggle"
            title="展开右侧面板"
            onClick={() => setCollapsed(false)}
          >
            <span className="sp-panel-toggle-text">参谋对话 · 版本历史</span>
          </button>
        ) : (
          <>
            <div className="sp-panel-head">
              <div className="sp-tabs">
                <button
                  type="button"
                  className={panelTab === 'chat' ? 'is-on' : ''}
                  onClick={() => setPanelTab('chat')}
                >
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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="折叠"
                onClick={() => setCollapsed(true)}
              >
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
                  stateVersion={session.stateVersion ?? 0}
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
