import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import type { ChatMessage } from '@shared/types'
import { MINDSET_QUESTIONS } from '@shared/core'
import './ChatPanel.css'

export interface ChatPanelProps {
  sessionId: string
  articleId: string | null
  /** 存在时，讨论过一轮后可在面板底部一键把结论套用到第一步 */
  onApplyToProblem?: () => void
  title?: string
  intro?: { title: string; desc: string }
  quickQuestions?: string[]
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  failed?: boolean
  errorText?: string
}

const QUICK_PREFIX = ['我的', '', '明天']
const QUICK_QUESTIONS = MINDSET_QUESTIONS.map((q, i) => `${QUICK_PREFIX[i] ?? ''}${q}`)

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function toDisplay(m: ChatMessage): DisplayMessage {
  return { id: m.id, role: m.role, content: m.content }
}

const READING_INTRO = {
  title: '我是你的《毛选》实用阅读教练。',
  desc: '我只指原文、提问、批改，不替你总结，也不代写笔记。'
}

export function ChatPanel({
  sessionId,
  articleId,
  onApplyToProblem,
  title = '教练对话',
  intro = READING_INTRO,
  quickQuestions = QUICK_QUESTIONS
}: ChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [articleTitle, setArticleTitle] = useState<string | null>(null)

  const pendingRef = useRef<{ requestId: string; streamingId: string } | null>(null)
  const lastTextRef = useRef('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const sessionRef = useRef(sessionId)
  const titleCacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])

  // 切换会话：重置全部本地状态并拉取历史
  useEffect(() => {
    let alive = true
    setLoading(true)
    setMessages([])
    setInput('')
    setError('')
    setConfirmClear(false)
    setSending(false)
    pendingRef.current = null
    lastTextRef.current = ''

    window.api.chat
      .list(sessionId)
      .then((list) => {
        if (!alive) return
        setMessages(list.map(toDisplay))
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(errorText(e))
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [sessionId])

  // 订阅流式事件；只处理当前 pending 的 requestId
  useEffect(() => {
    const offChunk = window.api.chat.onChunk((e) => {
      const pending = pendingRef.current
      if (!pending || pending.requestId !== e.requestId) return
      setMessages((prev) =>
        prev.map((m) => (m.id === pending.streamingId ? { ...m, content: m.content + e.delta } : m))
      )
    })

    const offDone = window.api.chat.onDone((e) => {
      const pending = pendingRef.current
      if (!pending || pending.requestId !== e.requestId) return
      pendingRef.current = null
      setSending(false)
      setMessages((prev) =>
        prev.map((m) => (m.id === pending.streamingId ? toDisplay(e.message) : m))
      )
    })

    const offError = window.api.chat.onError((e) => {
      const pending = pendingRef.current
      if (!pending || pending.requestId !== e.requestId) return
      pendingRef.current = null
      setSending(false)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pending.streamingId
            ? { ...m, streaming: false, failed: true, errorText: e.error }
            : m
        )
      )
    })

    return () => {
      offChunk()
      offDone()
      offError()
    }
  }, [])

  // 外部（第一步诊断卡片）请求预填并聚焦输入框
  useEffect(() => {
    function onPrefill(e: Event) {
      const el = inputRef.current
      const raw = (e as CustomEvent<string>).detail
      const text = typeof raw === 'string' && raw.trim() ? raw : '我对诊断有不同看法：'
      if (!el) return
      if (!el.value.trim()) setInput(text)
      el.focus()
    }
    window.addEventListener('chat-prefill', onPrefill)
    return () => window.removeEventListener('chat-prefill', onPrefill)
  }, [])

  // 正在读的文章标题（带缓存）
  useEffect(() => {
    if (!articleId) {
      setArticleTitle(null)
      return
    }
    const cached = titleCacheRef.current.get(articleId)
    if (cached) {
      setArticleTitle(cached)
      return
    }
    let alive = true
    window.api.articles
      .get(articleId)
      .then((a) => {
        if (!alive) return
        const title = a ? a.title : articleId
        titleCacheRef.current.set(articleId, title)
        setArticleTitle(title)
      })
      .catch(() => {
        if (alive) setArticleTitle(articleId)
      })
    return () => {
      alive = false
    }
  }, [articleId])

  // 自动滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || sending) return
      const sid = sessionId
      setError('')
      setSending(true)
      setInput('')
      lastTextRef.current = content

      try {
        const { requestId, userMessage } = await window.api.chat.send(sid, content, articleId)
        if (sessionRef.current !== sid) return
        const streamingId = `local-${requestId}`
        pendingRef.current = { requestId, streamingId }
        setMessages((prev) => [
          ...prev,
          toDisplay(userMessage),
          { id: streamingId, role: 'assistant', content: '', streaming: true }
        ])
      } catch (e) {
        if (sessionRef.current !== sid) return
        setError(errorText(e))
        setSending(false)
        setInput(content)
      }
    },
    [sessionId, articleId, sending]
  )

  const retry = useCallback(() => {
    const text = lastTextRef.current
    if (!text || sending) return
    // 去掉失败的助手气泡与上一条用户消息，重发时会重新追加
    setMessages((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].failed) {
          next.splice(i, 1)
          break
        }
      }
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'user') {
          next.splice(i, 1)
          break
        }
      }
      return next
    })
    void send(text)
  }, [send, sending])

  const doClear = useCallback(async () => {
    setConfirmClear(false)
    setError('')
    try {
      await window.api.chat.clear(sessionId)
      pendingRef.current = null
      setSending(false)
      setMessages([])
    } catch (e) {
      setError(errorText(e))
    }
  }, [sessionId])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    void send(input)
  }

  const hasUserMessage = messages.some((m) => m.role === 'user' && !m.failed)
  const showApplyHint = Boolean(onApplyToProblem) && hasUserMessage && !sending

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <span className="chat-title">{title}</span>
        <span className="spacer" />
        {sending && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void window.api.models.cancel(sessionId)}
          >
            停止回复
          </button>
        )}
        {messages.length > 0 &&
          (confirmClear ? (
            <span className="chat-confirm">
              <span className="muted">清空全部对话？</span>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => void doClear()}
              >
                确定
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setConfirmClear(false)}
              >
                取消
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setConfirmClear(true)}
            >
              清空
            </button>
          ))}
      </div>

      <div className="chat-list scroll" ref={listRef}>
        {loading && (
          <div className="empty">
            <span className="spinner" /> 加载对话…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <p className="chat-empty-title">{intro.title}</p>
            <p className="muted">{intro.desc}</p>
            <div className="chat-quick">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={sending}
                  onClick={() => void send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
            <div className="chat-bubble">
              {m.role === 'assistant' ? (
                m.streaming && !m.content ? (
                  <span className="spinner" />
                ) : (
                  <div className="chat-markdown">
                    <Markdown>{m.content}</Markdown>
                  </div>
                )
              ) : (
                <span className="chat-plain">{m.content}</span>
              )}
              {m.streaming && m.content ? <span className="chat-cursor" /> : null}
            </div>
            {m.failed && (
              <div className="chat-error">
                <span>{m.errorText || '发送失败'}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={sending}
                  onClick={retry}
                >
                  重试
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {articleTitle && <div className="chat-reading-tag">正在读：《{articleTitle}》</div>}

      {showApplyHint && (
        <div className="chat-apply-hint">
          <span className="chat-apply-hint-text">
            对诊断有不同看法？讨论完可以把结论套用到第一步
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={sending}
            onClick={() => onApplyToProblem?.()}
          >
            套用到第一步 →
          </button>
        </div>
      )}

      <div className="chat-input-row">
        <textarea
          className="textarea chat-input"
          ref={inputRef}
          value={input}
          placeholder="问教练…（Enter 发送，Shift+Enter 换行）"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={sending || input.trim().length === 0}
          onClick={() => void send(input)}
        >
          {sending ? '回复中…' : '发送'}
        </button>
      </div>

      {error && <div className="error-text chat-foot-error">{error}</div>}
    </div>
  )
}
