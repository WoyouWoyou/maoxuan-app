import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CheckCircle,
  Circle,
  FolderSimple,
  Info,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SquaresFour,
  Sparkle,
  X
} from '@phosphor-icons/react'
import { QUADRANTS, dueLabel, localDay, type ActionEdit, type HubAction } from '@shared/actions'
import type { ActionQuadrant, Session } from '@shared/types'
import { useActionHub } from '../features/actions/context'
import './ActionsPage.css'

type Filter = 'all' | 'today' | 'done'
type QuadrantFilter = ActionQuadrant | 'unassigned' | ''
const sourceName = (mode: HubAction['mode']) =>
  mode === 'default' ? '默认' : mode === 'reading' ? '阅读法' : '工作法'
const sourceLabel = (task: HubAction) =>
  task.mode === 'default' ? '默认' : `${sourceName(task.mode)} · ${task.sessionTitle}`
const quadrantName = (key: ActionQuadrant | null) =>
  QUADRANTS.find((q) => q.key === key)?.label ?? '待归类'

export function ActionsPage() {
  const hub = useActionHub()
  const [view, setView] = useState<'matrix' | 'todo'>(() => {
    try {
      return localStorage.getItem('maoxuan.actionsView') === 'todo' ? 'todo' : 'matrix'
    } catch {
      return 'matrix'
    }
  })
  const [filter, setFilter] = useState<Filter>('all')
  const [source, setSource] = useState('all')
  const [query, setQuery] = useState('')
  const [quadrant, setQuadrant] = useState<QuadrantFilter>('')
  const [includeDone, setIncludeDone] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [classificationMessage, setClassificationMessage] = useState('')
  const [today, setToday] = useState(localDay)
  const taskTrigger = useRef<HTMLElement | null>(null)
  function closeDetail() {
    setSelected(null)
    requestAnimationFrame(() => taskTrigger.current?.focus())
  }
  const detail = hub.tasks.find((t) => t.key === selected)
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDay()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !adding) closeDetail()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [adding])
  function switchView(next: 'matrix' | 'todo') {
    setView(next)
    if (next === 'matrix') setQuadrant('')
    try {
      localStorage.setItem('maoxuan.actionsView', next)
    } catch {
      /* session-only preference */
    }
  }
  async function guard(work: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await work()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      void hub.reload()
      return false
    } finally {
      setBusy(false)
    }
  }
  const scoped = hub.tasks.filter(
    (t) =>
      t.status !== 'dropped' &&
      (source === 'all' || t.mode === source) &&
      `${t.text} ${t.sessionTitle}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  const pending = scoped.filter((t) => t.status === 'todo')
  const unassigned = pending.filter((t) => !t.quadrant)
  async function autoClassify() {
    if (classifying || !unassigned.length) return
    setClassifying(true)
    setClassificationMessage('')
    setError('')
    try {
      const result = await hub.classify(unassigned.slice(0, 200))
      setClassificationMessage(
        `已分类 ${result.classified} 条${result.skipped ? `，跳过 ${result.skipped} 条已变更的任务` : ''}${result.failed ? `，${result.failed} 条未能分类` : ''}。`
      )
      if (result.errors.length) setError(`AI 分类未全部完成：${result.errors[0]}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setClassifying(false)
    }
  }
  const classifyButton = (
    <button
      type="button"
      className="btn btn-primary actions-ai-button"
      disabled={classifying || busy || hub.loading || !unassigned.length}
      onClick={() => void autoClassify()}
    >
      {classifying ? <span className="spinner" /> : <Sparkle size={17} />}{' '}
      {classifying ? 'AI 分类中…' : 'AI 自动分类'}
    </button>
  )
  const filtered = scoped
    .filter(
      (t) =>
        (!quadrant || (quadrant === 'unassigned' ? !t.quadrant : t.quadrant === quadrant)) &&
        (view === 'matrix'
          ? includeDone || t.status === 'todo'
          : filter === 'done'
            ? t.status === 'done'
            : filter === 'today'
              ? t.status === 'todo' && !!t.dueDate && t.dueDate.slice(0, 10) <= today
              : true)
    )
    .sort(
      (a, b) =>
        (a.dueDate.slice(0, 10) || '9999').localeCompare(b.dueDate.slice(0, 10) || '9999') ||
        (a.quadrant ? QUADRANTS.findIndex((q) => q.key === a.quadrant) : 4) -
          (b.quadrant ? QUADRANTS.findIndex((q) => q.key === b.quadrant) : 4) ||
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        a.createdAt.localeCompare(b.createdAt)
    )
  function showQuadrant(next: QuadrantFilter) {
    setQuadrant(next === quadrant ? '' : next)
    setFilter('all')
  }
  function row(task: HubAction, compact = false) {
    return (
      <TaskRow
        key={task.key}
        task={task}
        today={today}
        compact={compact}
        selected={selected === task.key}
        busy={busy}
        onOpen={() => {
          taskTrigger.current = document.activeElement as HTMLElement
          setSelected(task.key)
        }}
        onToggle={() =>
          void guard(() => hub.edit(task, { status: task.status === 'done' ? 'todo' : 'done' }))
        }
      />
    )
  }
  const groups = [
    {
      label: '已逾期',
      tasks: filtered.filter(
        (t) => t.status === 'todo' && t.dueDate && t.dueDate.slice(0, 10) < today
      ),
      tone: 'overdue'
    },
    {
      label: '今天',
      tasks: filtered.filter((t) => t.status === 'todo' && t.dueDate.slice(0, 10) === today),
      tone: 'today'
    },
    {
      label: '接下来',
      tasks: filtered.filter((t) => t.status === 'todo' && t.dueDate.slice(0, 10) > today),
      tone: 'next'
    },
    {
      label: '未安排日期',
      tasks: filtered.filter((t) => t.status === 'todo' && !t.dueDate),
      tone: 'undated'
    },
    { label: '已完成', tasks: filtered.filter((t) => t.status === 'done'), tone: 'done' }
  ]
  return (
    <div className={`actions-page${detail ? ' has-detail' : ''}`}>
      <section className="actions-main scroll">
        <header className="actions-header">
          <div>
            <h1>四象限工作法</h1>
            <p>日常任务、阅读法与工作法的行动，都在这里继续。</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setAdding(true)}
            disabled={hub.loading}
          >
            <Plus size={16} /> 添加任务
          </button>
        </header>
        <div className="actions-view-tabs" role="tablist" aria-label="任务视图">
          <button
            role="tab"
            aria-selected={view === 'matrix'}
            className={view === 'matrix' ? 'is-active' : ''}
            onClick={() => switchView('matrix')}
          >
            四象限
          </button>
          <button
            role="tab"
            aria-selected={view === 'todo'}
            className={view === 'todo' ? 'is-active' : ''}
            onClick={() => switchView('todo')}
          >
            Todo 清单
          </button>
        </div>
        {(error || hub.error) && (
          <div className="actions-error" role="alert">
            {error || `任务加载失败：${hub.error}`}
            <button className="btn btn-sm" onClick={() => void hub.reload()}>
              重新加载
            </button>
          </div>
        )}
        <div className="actions-toolbar">
          {view === 'todo' && (
            <div className="actions-filters" aria-label="任务状态">
              {(
                [
                  ['all', '全部任务'],
                  ['today', '今天'],
                  ['done', '已完成']
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  className={filter === key ? 'is-active' : ''}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="actions-search-tools">
            <select
              className="input"
              aria-label="任务来源"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="all">全部来源</option>
              <option value="default">默认</option>
              <option value="reading">阅读法</option>
              <option value="workbench">工作法</option>
            </select>
            <label className="actions-search">
              <MagnifyingGlass size={17} />
              <input
                placeholder="搜索任务或问题…"
                aria-label="搜索任务或问题"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {view === 'matrix' && (
              <label className="actions-show-done">
                <input
                  type="checkbox"
                  checked={includeDone}
                  onChange={(e) => setIncludeDone(e.target.checked)}
                />{' '}
                已完成
              </label>
            )}
          </div>
        </div>
        {quadrant && (
          <div className="actions-active-filter">
            正在查看：{quadrant === 'unassigned' ? '待归类' : quadrantName(quadrant)}
            <button className="btn btn-ghost btn-sm" onClick={() => setQuadrant('')}>
              <X size={14} /> 清除筛选
            </button>
          </div>
        )}
        {hub.loading ? (
          <div className="actions-empty">
            <span className="spinner" /> 正在汇集行动…
          </div>
        ) : hub.tasks.length === 0 && !hub.error ? (
          <div className="actions-empty actions-first">
            <SquaresFour size={42} weight="duotone" />
            <h2>把想清楚的事，变成行动。</h2>
            <p>
              阅读法和工作法中形成的行动，会自动出现在这里。
              <br />
              也可以直接添加日常工作或临时任务。
            </p>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> 添加第一条任务
            </button>
          </div>
        ) : view === 'matrix' ? (
          <>
            <div className="actions-inbox">
              <Info size={18} />
              <strong>待归类 {unassigned.length}</strong>
              <span>新行动先确认重要性与紧急度。</span>
              {classifyButton}
              <button
                onClick={() => {
                  switchView('todo')
                  setQuadrant('unassigned')
                  setFilter('all')
                }}
              >
                整理任务 <CaretRight size={14} />
              </button>
            </div>
            {classificationMessage && (
              <p className="actions-ai-result" role="status">
                {classificationMessage}
              </p>
            )}
            <div className="actions-matrix">
              <div className="actions-axis-top" />
              <div className="actions-axis-top urgent">紧急</div>
              <div className="actions-axis-top not-urgent">不紧急</div>
              <div className="actions-axis-side">重要</div>
              {QUADRANTS.slice(0, 2).map((q) => (
                <Quadrant
                  key={q.key}
                  quadrant={q}
                  tasks={filtered.filter((t) => t.quadrant === q.key)}
                  row={row}
                />
              ))}
              <div className="actions-axis-side">不重要</div>
              {QUADRANTS.slice(2).map((q) => (
                <Quadrant
                  key={q.key}
                  quadrant={q}
                  tasks={filtered.filter((t) => t.quadrant === q.key)}
                  row={row}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="actions-todo-layout">
            <div className="actions-list">
              <h2 className="actions-today-title">
                {filter === 'done'
                  ? '做完的每一步，都算数。'
                  : quadrant === 'unassigned'
                    ? '先判断轻重缓急，再开始。'
                    : '把重要的事，一件件做完。'}
              </h2>
              {filtered.length === 0 ? (
                <div className="actions-empty">
                  {filter === 'today'
                    ? '今天没有待办任务，可以提前安排接下来的行动。'
                    : '没有符合条件的任务。'}
                </div>
              ) : (
                groups
                  .filter((g) => g.tasks.length > 0)
                  .map((g) => (
                    <details className={`actions-group ${g.tone}`} key={g.tone} open>
                      <summary>
                        {g.label} <span>· {g.tasks.length}</span>
                        <CaretDown size={14} />
                      </summary>
                      {g.tasks.map((t) => row(t))}
                    </details>
                  ))
              )}
            </div>
            <aside className="actions-summary" aria-label="按四象限筛选">
              <h2>按四象限查看</h2>
              <div className="actions-summary-grid">
                {QUADRANTS.map((q) => (
                  <button
                    key={q.key}
                    className={`q-${q.key}${quadrant === q.key ? ' is-selected' : ''}`}
                    aria-pressed={quadrant === q.key}
                    onClick={() => showQuadrant(q.key)}
                  >
                    <span>
                      <Circle size={9} weight="fill" /> {q.label}
                    </span>
                    <strong>{pending.filter((t) => t.quadrant === q.key).length}</strong>
                    <CaretRight size={14} />
                  </button>
                ))}
              </div>
              <button
                className={`actions-summary-inbox${quadrant === 'unassigned' ? ' is-selected' : ''}`}
                aria-pressed={quadrant === 'unassigned'}
                onClick={() => showQuadrant('unassigned')}
              >
                <FolderSimple size={18} /> 待归类 <span>{unassigned.length}</span>
                <CaretRight size={14} />
              </button>
              <p>新行动自动汇入，先判断再安排。</p>
              <div className="actions-ai-classify">
                {classifyButton}
                <p>
                  {unassigned.length > 200
                    ? '每次分类当前范围内前 200 条待归类任务。'
                    : '仅分类当前范围内的待归类任务，可随时手动调整。'}
                </p>
                {classificationMessage && (
                  <p className="actions-ai-result" role="status">
                    {classificationMessage}
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
        <footer className="actions-footer">
          <Info size={15} /> 在这里勾选完成，原问题中的行动也会同步更新。
        </footer>
      </section>
      {detail && (
        <ActionDetail
          key={detail.key}
          task={detail}
          busy={busy}
          onClose={closeDetail}
          onSave={(change, progress) => guard(() => hub.edit(detail, change, progress))}
        />
      )}
      {adding && (
        <AddActionDialog
          sessions={hub.sessions}
          onClose={() => setAdding(false)}
          onAdd={async (sessionId, change) => {
            const key = await hub.add(sessionId, change)
            setAdding(false)
            setSelected(key)
          }}
        />
      )}
    </div>
  )
}

function Quadrant({
  quadrant,
  tasks,
  row
}: {
  quadrant: (typeof QUADRANTS)[number]
  tasks: HubAction[]
  row: (t: HubAction, compact?: boolean) => ReactNode
}) {
  return (
    <section className={`actions-quadrant q-${quadrant.key}`} aria-label={quadrant.label}>
      <h2>
        {quadrant.label}
        <span>
          · {quadrant.description} · {tasks.length}
        </span>
      </h2>
      {tasks.length ? (
        tasks.map((t) => row(t, true))
      ) : (
        <p className="actions-quadrant-empty">暂无任务</p>
      )}
    </section>
  )
}
function TaskRow({
  task,
  today,
  compact,
  selected,
  busy,
  onOpen,
  onToggle
}: {
  task: HubAction
  today: string
  compact: boolean
  selected: boolean
  busy: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  const overdue = task.status === 'todo' && task.dueDate && task.dueDate.slice(0, 10) < today
  return (
    <div
      className={`action-row${compact ? ' is-compact' : ''}${selected ? ' is-selected' : ''}${task.status === 'done' ? ' is-done' : ''}`}
    >
      <input
        type="checkbox"
        className="action-check"
        checked={task.status === 'done'}
        aria-label={`${task.status === 'done' ? '恢复任务' : '完成任务'}：${task.text}`}
        disabled={busy}
        onChange={onToggle}
      />
      <button className="action-open" onClick={onOpen} aria-label={`查看任务：${task.text}`}>
        <span className="action-row-title">{task.text}</span>
        <span className="action-row-meta">
          <span className={`action-quadrant-badge q-${task.quadrant ?? 'unassigned'}`}>
            {quadrantName(task.quadrant)}
          </span>
          <span className="action-source">
            {sourceLabel(task)}
            {task.archived ? ' · 已归档' : ''}
          </span>
        </span>
        <span
          className={`action-due${overdue || task.dueDate.slice(0, 10) === today ? ' is-urgent' : ''}`}
        >
          <CalendarBlank size={14} />
          {dueLabel(task.dueDate, today)}
        </span>
      </button>
    </div>
  )
}

function EditableText({
  label,
  value,
  placeholder,
  disabled,
  onSave
}: {
  label: string
  value: string
  placeholder: string
  disabled: boolean
  onSave: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <section className="action-detail-section">
      <h3>
        {label}
        <button
          className="action-edit-link"
          onClick={() => ref.current?.focus()}
          disabled={disabled}
        >
          <PencilSimple size={14} /> 编辑
        </button>
      </h3>
      <textarea
        ref={ref}
        key={value}
        defaultValue={value}
        aria-label={label}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        onBlur={(e) => {
          if (e.target.value.trim() !== value) onSave(e.target.value.trim())
        }}
      />
      <span className="action-field-hint">离开输入框自动保存</span>
    </section>
  )
}
function ActionDetail({
  task,
  busy,
  onClose,
  onSave
}: {
  task: HubAction
  busy: boolean
  onClose: () => void
  onSave: (change: ActionEdit, progress?: string) => Promise<boolean>
}) {
  const [progress, setProgress] = useState('')
  const [newest, setNewest] = useState(false)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
  }, [])
  const entries = [...task.progress].sort((a, b) =>
    newest ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)
  )
  return (
    <aside className="action-detail" aria-label="行动详情">
      <header>
        <h2>行动详情</h2>
        <button
          ref={close}
          className="btn btn-ghost btn-sm"
          aria-label="关闭行动详情"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="action-detail-body scroll">
        <textarea
          className="action-detail-title"
          key={task.text}
          defaultValue={task.text}
          rows={2}
          aria-label="任务名称"
          disabled={busy}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value.trim() !== task.text)
              void onSave({ text: e.target.value.trim() })
            else e.target.value = task.text
          }}
        />
        <p className="action-detail-source">
          来源：
          {task.mode === 'default' ? (
            '默认'
          ) : (
            <Link to={`/session/${task.sessionId}`}>{sourceLabel(task)}</Link>
          )}
        </p>
        {task.mode !== 'default' && (
          <Link className="action-back-source" to={`/session/${task.sessionId}`}>
            回到原问题 <ArrowSquareOut size={14} />
          </Link>
        )}
        <div className="action-detail-properties">
          <label>
            <span>象限</span>
            <select
              className={`input q-${task.quadrant ?? 'unassigned'}`}
              aria-label="任务象限"
              value={task.quadrant ?? ''}
              disabled={busy}
              onChange={(e) =>
                void onSave({ quadrant: (e.target.value || null) as ActionQuadrant | null })
              }
            >
              <option value="">待归类</option>
              {QUADRANTS.map((q) => (
                <option key={q.key} value={q.key}>
                  {q.label} · {q.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>截止</span>
            <input
              className="input"
              type="date"
              aria-label="截止日期"
              value={task.dueDate.slice(0, 10)}
              disabled={busy}
              onChange={(e) =>
                void onSave({
                  dueDate: e.target.value
                    ? e.target.value + (task.dueDate.includes('T') ? task.dueDate.slice(10) : '')
                    : ''
                })
              }
            />
          </label>
          <label>
            <span>时间</span>
            <input
              className="input"
              type="time"
              aria-label="截止时间"
              value={task.dueDate.includes('T') ? task.dueDate.slice(11, 16) : ''}
              disabled={busy || !task.dueDate}
              onChange={(e) =>
                void onSave({
                  dueDate: task.dueDate.slice(0, 10) + (e.target.value ? `T${e.target.value}` : '')
                })
              }
            />
          </label>
          {task.horizon && (
            <p className="action-detail-horizon">
              原行动周期：
              {task.horizon === '7d' ? '7 天' : task.horizon === '30d' ? '30 天' : '90 天'}
            </p>
          )}
        </div>
        <EditableText
          label="行动目的"
          value={task.purpose}
          placeholder="为什么要做这件事？"
          disabled={busy}
          onSave={(purpose) => void onSave({ purpose })}
        />
        <EditableText
          label="完成标准"
          value={task.verify}
          placeholder="做到什么，才算真正完成？"
          disabled={busy}
          onSave={(verify) => void onSave({ verify })}
        />
        <section className="action-detail-section action-progress">
          <h3>
            进展记录
            <button className="action-edit-link" onClick={() => setNewest(!newest)}>
              按时间 <CaretDown size={13} className={newest ? 'is-reversed' : ''} />
            </button>
          </h3>
          {entries.length === 0 ? (
            <p className="action-no-progress">还没有记录，从这次推进开始。</p>
          ) : (
            <ol className="action-timeline">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <time>
                    {new Date(entry.createdAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </time>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ol>
          )}
          <form
            className="action-progress-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (progress.trim())
                void onSave({}, progress.trim()).then((ok) => {
                  if (ok) setProgress('')
                })
            }}
          >
            <textarea
              aria-label="新增进展"
              placeholder="写下这次推进了什么…"
              value={progress}
              disabled={busy}
              rows={3}
              onChange={(e) => setProgress(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !progress.trim()}
            >
              记录进展
            </button>
          </form>
        </section>
        {task.result && (
          <section className="action-detail-section">
            <h3>行动结果</h3>
            <p className="action-result">{task.result}</p>
          </section>
        )}
      </div>
      <footer>
        <button
          className={`btn ${task.status === 'done' ? 'btn-ghost' : 'btn-primary'}`}
          disabled={busy}
          onClick={() => void onSave({ status: task.status === 'done' ? 'todo' : 'done' })}
        >
          {task.status === 'done' ? (
            <ArrowCounterClockwise size={18} />
          ) : (
            <CheckCircle size={20} weight="fill" />
          )}
          {busy ? '正在保存…' : task.status === 'done' ? '恢复为待办' : '标记完成'}
        </button>
        <p>{task.mode === 'default' ? '完成状态会自动保存。' : '完成状态会同步回原问题。'}</p>
      </footer>
    </aside>
  )
}

function AddActionDialog({
  sessions,
  onClose,
  onAdd
}: {
  sessions: Session[]
  onClose: () => void
  onAdd: (id: string, edit: ActionEdit) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState('')
  const [text, setText] = useState('')
  const [quadrant, setQuadrant] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    dialog?.querySelector('input')?.focus()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="action-add-dialog"
      aria-labelledby="action-add-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          void onAdd(source, {
            text,
            quadrant: (quadrant || null) as ActionQuadrant | null,
            dueDate
          }).catch((e) => {
            setError(e instanceof Error ? e.message : String(e))
            setBusy(false)
          })
        }}
      >
        <header>
          <h2 id="action-add-title">添加行动任务</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="关闭添加任务"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <label>
          任务名称
          <input
            className="input"
            autoFocus
            required
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写一个可以执行、可以验证的动作"
            disabled={busy}
          />
        </label>
        <label>
          来源
          <select
            className="input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={busy}
          >
            <option value="">默认</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {sourceName(s.mode)} · {s.title}
                {s.status === 'archived' ? '（已归档）' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="action-add-columns">
          <label>
            象限
            <select
              className="input"
              value={quadrant}
              onChange={(e) => setQuadrant(e.target.value)}
              disabled={busy}
            >
              <option value="">待归类</option>
              {QUADRANTS.map((q) => (
                <option key={q.key} value={q.key}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            截止日期
            <input
              className="input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <p className="action-add-hint">
          {source
            ? '任务会同时保存到关联问题的行动清单中。'
            : '直接添加日常工作或临时任务，无需关联问题。'}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
            <Plus size={16} />
            {busy ? '正在添加…' : '添加任务'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
