import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ArticleMeta, SearchHit } from '@shared/types'
import type { ImportPreview } from '@shared/contracts/library'
import { useBooks, refreshBooks } from '../features/library/useBooks'
import { useTasks } from '../features/tasks/useTasks'
import './LibraryPage.css'
import '../features/library/library.css'
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
export function LibraryPage() {
  const navigate = useNavigate(),
    books = useBooks(),
    tasks = useTasks()
  const [bookId, setBookId] = useState('maoxuan'),
    [chapters, setChapters] = useState<ArticleMeta[]>([])
  const [query, setQuery] = useState(''),
    [hits, setHits] = useState<SearchHit[]>([]),
    [error, setError] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null),
    [title, setTitle] = useState(''),
    [author, setAuthor] = useState('')
  const [encoding, setEncoding] = useState(''),
    [parsing, setParsing] = useState(false),
    [saving, setSaving] = useState(false),
    [taskId, setTaskId] = useState('')
  const [showHidden, setShowHidden] = useState(false),
    [hidden, setHidden] = useState<typeof books>([])
  const [chapterTitles, setChapterTitles] = useState<string[]>([])
  const [merges, setMerges] = useState<number[]>([])
  useEffect(() => {
    setChapterTitles(preview?.chapters.map((c) => c.title) ?? [])
    setMerges([])
  }, [preview?.id])
  const book = books.find((b) => b.bookId === bookId)
  useEffect(() => {
    if (!book) return
    let alive = true
    setError('')
    setChapters([])
    void window.api.articles
      .list(book)
      .then((list) => {
        if (alive) setChapters(list)
      })
      .catch((e) => {
        if (alive) setError(message(e))
      })
    return () => {
      alive = false
    }
  }, [bookId, book?.revisionId])
  useEffect(() => {
    if (!book || !query.trim()) {
      setHits([])
      return
    }
    let alive = true
    const timer = setTimeout(
      () =>
        void window.api.articles
          .search(query, 60, book)
          .then((r) => {
            if (alive) setHits(r)
          })
          .catch((e) => {
            if (alive) setError(message(e))
          }),
      250
    )
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query, bookId])
  useEffect(() => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task || ['running', 'queued'].includes(task.status)) return
    setParsing(false)
    if (task.status === 'succeeded' && task.result) {
      try {
        const p = JSON.parse(task.result) as ImportPreview
        setPreview(p)
        setTitle(p.title)
        setAuthor(p.author)
      } catch {
        setError('导入预览格式错误')
      }
    } else setError(task.error ?? '导入已取消')
    setTaskId('')
  }, [tasks, taskId])
  const run = async (fn: () => Promise<void>) => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(message(e))
    }
  }
  async function choose() {
    setPreview(null)
    setParsing(true)
    try {
      const id = await window.api.library.choose(encoding || undefined)
      setTaskId(id ?? '')
      if (!id) setParsing(false)
    } catch (e) {
      setError(message(e))
      setParsing(false)
    }
  }
  async function confirm() {
    if (!preview) return
    setSaving(true)
    await run(async () => {
      const id = await window.api.library.confirm(preview.id, title, author, {
        titles: chapterTitles,
        mergeWithPrevious: merges
      })
      await refreshBooks()
      setBookId(id)
      setPreview(null)
    })
    setSaving(false)
  }
  async function index() {
    if (!book) return
    await run(async () => {
      await window.api.library.index(book.bookId)
    })
  }
  useEffect(() => {
    if (tasks.some((t) => t.kind === 'index' && t.status === 'succeeded'))
      void refreshBooks().catch(() => {})
  }, [
    tasks
      .filter((t) => t.kind === 'index' && t.status === 'succeeded')
      .map((t) => t.id)
      .sort()
      .join(',')
  ])
  const currentTasks = tasks.filter(
    (t) => t.kind === 'index' && t.scope.startsWith(book?.revisionId ?? 'NONE')
  )
  const active = currentTasks.find((t) => ['running', 'queued'].includes(t.status))
  return (
    <div className="lib">
      <header className="lib-head">
        <h1 className="lib-title">我的书架</h1>
        <button className="btn btn-primary" disabled={parsing} onClick={() => void choose()}>
          {parsing ? '正在后台解析…' : '＋ 导入 EPUB / TXT'}
        </button>
      </header>
      <div className="book-toolbar">
        <label>
          TXT 编码{' '}
          <select className="input" value={encoding} onChange={(e) => setEncoding(e.target.value)}>
            <option value="">自动识别</option>
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GB18030 / GBK</option>
            <option value="utf-16le">UTF-16 LE</option>
            <option value="utf-16be">UTF-16 BE</option>
          </select>
        </label>
        <span className="muted">
          文件在本地解析。AI 推荐只向你配置的服务发送问题与相关正文；整书索引需要另行启动。
        </span>
      </div>
      {error && <p className="error-text">{error}</p>}
      {parsing && taskId && (
        <button className="btn btn-ghost" onClick={() => void window.api.tasks.cancel(taskId)}>
          取消解析
        </button>
      )}
      {preview && (
        <section className="card import-preview">
          <h2>确认导入</h2>
          <label>
            书名
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            作者
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <p>
            {preview.chapters.length} 个章节/片段 · {preview.characters.toLocaleString()} 字 ·{' '}
            {preview.encoding}
          </p>
          {preview.warnings.map((w) => (
            <p className="muted" key={w}>
              {w}
            </p>
          ))}
          <details>
            <summary>查看目录</summary>
            <ol>
              {preview.chapters.map((c, i) => (
                <li key={i}>
                  <input
                    className="input"
                    aria-label={`第 ${i + 1} 章标题`}
                    value={chapterTitles[i] ?? c.title}
                    onChange={(e) =>
                      setChapterTitles((list) =>
                        list.map((value, n) => (n === i ? e.target.value : value))
                      )
                    }
                  />
                  （{c.length} 字）
                  {i > 0 && (
                    <label>
                      <input
                        type="checkbox"
                        checked={merges.includes(i)}
                        onChange={(e) =>
                          setMerges((list) =>
                            e.target.checked ? [...list, i] : list.filter((n) => n !== i)
                          )
                        }
                      />{' '}
                      合并到前一章
                    </label>
                  )}
                  <p className="muted">{c.preview}</p>
                </li>
              ))}
            </ol>
          </details>
          <div className="book-toolbar">
            <button
              className="btn btn-primary"
              disabled={saving || !title.trim()}
              onClick={() => void confirm()}
            >
              确认导入
            </button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>
              暂不导入
            </button>
          </div>
        </section>
      )}
      <div className="book-grid">
        {books.map((b) => (
          <button
            key={b.bookId}
            className={`card book-card ${bookId === b.bookId ? 'selected' : ''}`}
            onClick={() => {
              setBookId(b.bookId)
              setQuery('')
            }}
          >
            <strong>{b.title}</strong>
            <span className="muted">
              {b.author || '作者未填写'} · {b.format.toUpperCase()}
            </span>
            <span>
              {b.chapters} 章 · {b.characters.toLocaleString()} 字
            </span>
          </button>
        ))}
      </div>
      {book && (
        <section className="card">
          <h2>{book.title}</h2>
          <div className="book-toolbar">
            <button
              className="btn btn-primary"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('open-new-session', { detail: { bookId: book.bookId } })
                )
              }
            >
              带着问题读这本书
            </button>
            {book.profile === 'generic' && (
              <>
                <button className="btn btn-ghost" disabled={!!active} onClick={() => void index()}>
                  {active ? '索引进行中…' : '准备 / 继续 AI 索引'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    void run(async () => {
                      await window.api.library.hide(book.bookId, true)
                      setBookId('maoxuan')
                      await refreshBooks()
                    })
                  }
                >
                  从书架隐藏
                </button>
              </>
            )}
          </div>
          {book.profile === 'generic' && (
            <p className="muted">
              可直接手动阅读或按问题推荐。可选 AI 索引会分批处理全书并消耗 Token，粗略输入规模约{' '}
              {Math.ceil(book.characters * 1.5).toLocaleString()}{' '}
              Token，实际以服务商统计为准；已完成 {book.indexed}/{book.chapters} 章。
            </p>
          )}
          {currentTasks.slice(0, 2).map((t) => (
            <div className="task-line" key={t.id}>
              <span>
                {t.status === 'succeeded'
                  ? '索引完成'
                  : t.status === 'running'
                    ? '正在索引'
                    : t.status === 'queued'
                      ? '排队中'
                      : t.status === 'cancelled'
                        ? '已取消'
                        : t.status === 'interrupted'
                          ? '上次任务中断'
                          : '索引失败'}
                ：{t.progress}/{t.total}
              </span>
              {['running', 'queued'].includes(t.status) && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void window.api.tasks.cancel(t.id)}
                >
                  取消
                </button>
              )}
              {t.error && <span className="error-text">{t.error}</span>}
            </div>
          ))}
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="在本书标题与正文中搜索"
          />
          <div className="book-chapters">
            {(query.trim() ? hits : chapters).map((c, i) => (
              <button
                className="lib-toc-item"
                key={c.id}
                onClick={() => navigate(`/library/${c.id}`)}
              >
                <span className="lib-toc-index">{i + 1}</span>
                <span>
                  {c.title}
                  {'snippet' in c && (
                    <small className="book-search-snippet">{String(c.snippet)}</small>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <button
        className="btn btn-ghost"
        onClick={() => {
          setShowHidden(!showHidden)
          void window.api.library.list(true).then((list) => setHidden(list.filter((b) => b.hidden)))
        }}
      >
        管理隐藏书籍
      </button>
      {showHidden &&
        hidden.map((b) => (
          <p key={b.bookId}>
            {b.title}{' '}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                void run(async () => {
                  await window.api.library.hide(b.bookId, false)
                  await refreshBooks()
                  setHidden(hidden.filter((x) => x.bookId !== b.bookId))
                })
              }
            >
              恢复到书架
            </button>
          </p>
        ))}
      <details>
        <summary>最近后台任务</summary>
        {tasks.slice(0, 10).map((t) => (
          <p key={t.id}>
            {t.kind === 'import' ? '导入解析' : '书籍索引'} · {t.status} · {t.progress}/{t.total}{' '}
            {t.error}
            {t.kind === 'import' && t.status === 'succeeded' && t.result && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  try {
                    const p = JSON.parse(t.result!) as ImportPreview
                    setPreview(p)
                    setTitle(p.title)
                    setAuthor(p.author)
                  } catch {
                    setError('预览不可用，请重新选择文件')
                  }
                }}
              >
                查看导入预览
              </button>
            )}
          </p>
        ))}
      </details>
    </div>
  )
}
