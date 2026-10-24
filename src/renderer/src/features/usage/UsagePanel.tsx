import { useEffect, useState } from 'react'
import type { SessionSummary } from '@shared/types'
import type { UsageStats } from '@shared/contracts/usage'
import { useBooks } from '../library/useBooks'
const labels: Record<string, string> = {
  book_index: '全书索引',
  action_classification: '行动自动分类',
  diagnose: '问题与选章',
  findPassages: '原文标注',
  reviewNotes: '笔记反馈',
  reviewSituation: '复盘',
  mindset: '阅读小结',
  reviseProblem: '问题修订',
  wb_intake: '整理事实',
  wb_contradiction: '主要矛盾分析',
  wb_routes: '路线分析',
  wb_objSubj: '主客分析',
  wb_decide: '综合决策',
  wb_recheck: '决策检查',
  wb_actions: '生成行动',
  wb_recap: '工作台复盘',
  ai_diagnose: '问题与选章',
  ai_findPassages: '原文标注',
  ai_reviewNotes: '笔记反馈',
  ai_reviewSituation: '复盘',
  ai_mindset: '阅读小结',
  ai_reviseProblem: '问题修订',
  chat: '陪读聊天',
  workbench_chat: '工作台聊天',
  connection_test: '连接测试'
}
export function UsagePanel() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]),
    [sessionId, setSessionId] = useState('')
  useEffect(() => {
    void Promise.all([window.api.sessions.list(), window.api.sessions.listArchived()])
      .then((lists) => setSessions(lists.flat()))
      .catch(() => {})
  }, [])
  const books = useBooks(),
    [stats, setStats] = useState<UsageStats | null>(null),
    [days, setDays] = useState(30),
    [bookId, setBookId] = useState(''),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    void window.api.usage
      .query({
        days: days || undefined,
        bookId: bookId || undefined,
        sessionId: sessionId || undefined
      })
      .then((s) => {
        if (alive) {
          setStats(s)
          setError('')
        }
      })
      .catch((e) => {
        if (alive) setError(String(e))
      })
    return () => {
      alive = false
    }
  }, [days, bookId, sessionId, refresh])
  return (
    <section className="usage-panel">
      <h2>AI 用量</h2>
      <div className="book-toolbar">
        <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>今日</option>
          <option value={7}>近 7 天</option>
          <option value={30}>近 30 天</option>
          <option value={0}>全部</option>
        </select>
        <select className="input" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">所有书籍</option>
          {books.map((b) => (
            <option key={b.bookId} value={b.bookId}>
              {b.title}
            </option>
          ))}
        </select>
        <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">所有问题</option>
          {sessions
            .filter((s) => !bookId || s.bookId === bookId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
        </select>
        <button className="btn btn-ghost" onClick={() => setRefresh((n) => n + 1)}>
          刷新
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {stats && (
        <>
          <p>
            {stats.calls} 次实际请求 · 已知 / 估算总量 {stats.total.toLocaleString()} Token
          </p>
          <p className="muted">
            其中 {stats.estimated} 次为估算，{stats.unknown}{' '}
            次用量未知或不完整。失败及重试包含在内；统计不等于服务商账单。
          </p>
          <table className="usage-table">
            <thead>
              <tr>
                <th>功能 / 模型</th>
                <th>调用</th>
                <th>输入</th>
                <th>输出</th>
                <th>总 Token</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((r) => (
                <tr key={r.purpose + r.model}>
                  <td>
                    {labels[r.purpose] ?? (r.purpose.startsWith('wb_') ? '工作台' : r.purpose)}
                    <br />
                    <small>{r.model}</small>
                  </td>
                  <td>
                    {r.calls}（失败 {r.failed}）
                  </td>
                  <td>{r.input.toLocaleString()}</td>
                  <td>{r.output.toLocaleString()}</td>
                  <td>{r.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
