import { JOURNAL_TEMPLATES } from '@shared/journal-templates'
import { TemplatePicker } from './TemplatePicker'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CaretRight,
  Folder,
  FolderOpen,
  Notebook,
  Microphone,
  Archive,
  Trash,
  SidebarSimple,
  FileText,
  Paperclip,
  Plus,
  DotsThree,
  ArrowsOutSimple
} from '@phosphor-icons/react'
import {
  journalFolderHidden,
  type JournalCommand,
  type JournalFolder,
  type JournalNote,
  type JournalState
} from '@shared/journal'
import { MarkdownEditor } from './MarkdownEditor'
import { JournalMedia } from './JournalMedia'
import { recordingStore } from './recording-store'
import './journal.css'
const EMPTY: JournalState = { folders: [], notes: [] }
type View = 'all' | 'unfiled' | 'archived' | 'trash' | string
type Form = {
  title: string
  name?: string
  parentId?: string | null
  folders?: boolean
  submit: (name: string, parentId: string | null) => Promise<void>
}
function preference<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(`journal.${key}`) || 'null') ?? fallback
  } catch {
    return fallback
  }
}
function usePreference<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => preference(key, initial))
  useEffect(() => {
    localStorage.setItem(`journal.${key}`, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
export function JournalPage() {
  const attachmentInput = useRef<HTMLInputElement>(null)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [state, setState] = useState<JournalState>(EMPTY)
  const [view, setView] = usePreference<View>('view', 'all')
  const [selected, setSelected] = usePreference<string | null>('selected', null)
  const [closed, setClosed] = usePreference<string[]>('closedFolders', [])
  const [treeHidden, setTreeHidden] = usePreference('treeHidden', false)
  const [focused, setFocused] = useState(false)
  const previousLayout = useRef(false)
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    if (treeHidden)
      document.querySelector<HTMLButtonElement>('[aria-label="展开文件夹栏"]')?.focus()
  }, [treeHidden])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draft, setDraft] = useState<JournalNote | null>(null)
  const draftRef = useRef<JournalNote | null>(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const [saveStatus, setSaveStatus] = useState('已保存')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const composing = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [formName, setFormName] = useState('')
  const [formParent, setFormParent] = useState('')
  const [confirm, setConfirm] = useState<{ text: string; action: () => Promise<void> } | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [recoveries, setRecoveries] = useState<Awaited<ReturnType<typeof recordingStore.list>>>([])
  const stateRef = useRef(state)
  stateRef.current = state
  const disabled =
    !draft ||
    draft.deleted ||
    journalFolderHidden(state, draft.folderId, 'deleted') ||
    journalFolderHidden(state, draft.folderId, 'archived')
  const selectDraft = (n: JournalNote | null) => {
    draftRef.current = n
    setDraft(n)
    setSelected(n?.id ?? null)
    dirtyRef.current = false
    setDirty(false)
    setSaveStatus('已保存')
    setMediaOpen(false)
  }
  useEffect(() => {
    window.api.journal
      .list()
      .then((s) => {
        setState(s)
        selectDraft(s.notes.find((n) => n.id === selected) ?? null)
        setLoaded(true)
      })
      .catch((e) => setError(message(e)))
    recordingStore
      .list()
      .then(setRecoveries)
      .catch((e) => setError(`录音恢复存储不可用：${message(e)}`))
  }, [])
  const flush = useCallback(async () => {
    const run = async () => {
      const n = draftRef.current
      if (!n || !dirtyRef.current) return
      setSaveStatus('保存中…')
      try {
        const r = await window.api.journal.apply({
          kind: 'noteSave',
          id: n.id,
          revision: n.revision,
          title: n.title,
          markdown: n.markdown,
          tags: n.tags
        })
        const saved = r.state.notes.find((x) => x.id === n.id)!
        setState(r.state)
        if (r.earned) {
          setNotice('这篇记录获得10成长值，可以去种一株树。')
          window.dispatchEvent(new Event('sessions-changed'))
        }
        if (draftRef.current?.id === n.id) {
          const same = draftRef.current === n
          const next = same
            ? saved
            : { ...draftRef.current, revision: saved.revision, completedAt: saved.completedAt }
          draftRef.current = next
          setDraft(next)
          if (same) {
            dirtyRef.current = false
            setDirty(false)
            setSaveStatus('已保存')
          } else setSaveStatus('等待保存…')
        }
      } catch (e) {
        setSaveStatus('保存失败 · 点击重试')
        throw e
      }
    }
    const pending = saveQueue.current.catch(() => {}).then(run)
    saveQueue.current = pending
    return pending
  }, [])
  useEffect(() => {
    if (!dirty || composing.current) return
    const timer = setTimeout(() => {
      void flush().catch((e) => setError(message(e)))
    }, 700)
    return () => clearTimeout(timer)
  }, [draft, dirty, flush])
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || recorder.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a')
      if (!a || !a.getAttribute('href') || a.getAttribute('href')?.startsWith('#')) return
      if (recorder.current || dirtyRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setError(
          recorder.current ? '请先停止录音并保存，再离开日常记录' : '正在保存，请稍后再切换页面'
        )
        void flush().catch((e) => setError(message(e)))
      }
    }
    window.addEventListener('beforeunload', guard)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', guard)
      document.removeEventListener('click', click, true)
      const r = recorder.current
      void flush().catch(() => {})
      if (r && r.state !== 'inactive') r.stop()
    }
  }, [flush])
  useEffect(() => {
    if (!recording || paused) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording, paused])
  useEffect(() => {
    if (seconds >= 1800 && recorder.current?.state !== 'inactive') recorder.current?.stop()
  }, [seconds])
  function change(patch: Partial<JournalNote>) {
    if (disabled || !draftRef.current) return
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    dirtyRef.current = true
    setDirty(true)
    setSaveStatus('等待保存…')
  }
  async function mutate<T>(work: () => Promise<T>): Promise<T> {
    await flush()
    const pending = saveQueue.current.catch(() => {}).then(work)
    saveQueue.current = pending.then(
      () => {},
      () => {}
    )
    return pending
  }
  async function act(command: JournalCommand) {
    return mutate(async () => {
      const r = await window.api.journal.apply(command)
      setState(r.state)
      const id = r.selectedId ?? draftRef.current?.id
      const saved = r.state.notes.find((n) => n.id === id) ?? null
      if (saved && dirtyRef.current && draftRef.current?.id === saved.id) {
        const merged = {
          ...saved,
          title: draftRef.current.title,
          markdown: draftRef.current.markdown,
          tags: draftRef.current.tags
        }
        draftRef.current = merged
        setDraft(merged)
      } else selectDraft(saved)
      if (r.earned) {
        setNotice('这篇记录获得10成长值，可以去种一株树。')
        window.dispatchEvent(new Event('sessions-changed'))
      }
      return r
    })
  }
  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  const folderId = state.folders.some((f) => f.id === view) ? view : null
  const activeFolder = state.folders.find((f) => f.id === folderId)
  function openForm(f: Form) {
    setFormName(f.name ?? '')
    setFormParent(f.parentId ?? '')
    setForm(f)
  }
  const availableFolders = state.folders.filter(
    (f) =>
      !journalFolderHidden(state, f.id, 'archived') && !journalFolderHidden(state, f.id, 'deleted')
  )
  function path(id: string | null): string {
    const f = state.folders.find((f) => f.id === id)
    return f ? `${f.parentId ? path(f.parentId) + ' / ' : ''}${f.name}` : '未分类'
  }
  const notes = state.notes
    .filter((n) => {
      const deleted = n.deleted || journalFolderHidden(state, n.folderId, 'deleted')
      const archived = journalFolderHidden(state, n.folderId, 'archived')
      if (view === 'trash') {
        if (!deleted) return false
      } else {
        if (deleted) return false
        if (
          view === 'archived'
            ? !archived
            : archived && !(activeFolder && journalFolderHidden(state, activeFolder.id, 'archived'))
        )
          return false
      }
      if (view === 'unfiled' && n.folderId) return false
      if (filter === 'audio' && !n.attachments.some((a) => a.mime.startsWith('audio/')))
        return false
      if (filter === 'text' && !n.markdown.trim()) return false
      // The unified directory keeps all active notes visible across folders.
      return `${n.title}\n${n.markdown}\n${n.tags.join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase())
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const switchNote = (n: JournalNote) =>
    run(async () => {
      if (recorder.current) throw new Error('请先停止录音')
      await flush()
      selectDraft(stateRef.current.notes.find((x) => x.id === n.id) ?? n)
    })
  const chooseView = (next: string) => {
    setView(next)
    setSelectedIds([])
    setSearch('')
    setDrawer(false)
  }
  const toggleFocus = useCallback(() => {
    if (focused) {
      setTreeHidden(previousLayout.current)
      setFocused(false)
    } else {
      previousLayout.current = treeHidden
      setTreeHidden(true)
      setFocused(true)
    }
  }, [focused, treeHidden, setTreeHidden])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focused) toggleFocus()
        setDrawer(false)
        setForm(null)
        setTemplateOpen(false)
        setConfirm(null)
      }
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [focused, toggleFocus])
  function folderNodes(parentId: string | null, depth = 0): React.ReactNode {
    return state.folders
      .filter((f) => f.parentId === parentId && !f.deleted)
      .map((f) => {
        if (
          journalFolderHidden(state, f.id, 'archived') &&
          view !== 'archived' &&
          !(activeFolder && journalFolderHidden(state, activeFolder.id, 'archived'))
        )
          return null
        const expanded = !closed.includes(f.id)
        const hasChildren =
          state.folders.some((x) => x.parentId === f.id && !x.deleted) ||
          notes.some((n) => n.folderId === f.id)
        return (
          <div key={f.id}>
            <div
              className={`journal-folder ${view === f.id ? 'selected' : ''}`}
              style={{ paddingLeft: 8 + depth * 15 }}
            >
              <button
                className="journal-icon"
                aria-label={`${expanded ? '收起' : '展开'}${f.name}`}
                aria-expanded={expanded}
                disabled={!hasChildren}
                onClick={() =>
                  setClosed(expanded ? [...closed, f.id] : closed.filter((id) => id !== f.id))
                }
              >
                <CaretRight
                  size={12}
                  style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
                />
              </button>
              <button
                className="journal-folder-name"
                onClick={() => {
                  chooseView(f.id)
                }}
              >
                {expanded ? <FolderOpen size={17} /> : <Folder size={17} />}
                <span>{f.name}</span>
              </button>
              <button
                className="journal-icon"
                aria-label={`${f.name}的操作`}
                onClick={() => openFolderActions(f)}
              >
                ⋯
              </button>
            </div>
            {expanded && (
              <>
                {folderNodes(f.id, depth + 1)}
                {noteNodes(
                  notes.filter((n) => n.folderId === f.id),
                  depth + 1
                )}
              </>
            )}
          </div>
        )
      })
  }
  const noteTitle = (n: JournalNote) =>
    n.title ||
    n.markdown
      .replace(/[#>*_`~\[\]]/g, '')
      .trim()
      .split('\n')[0]
      ?.slice(0, 28) ||
    `随手记 · ${new Date(n.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  function noteNodes(items: JournalNote[], depth = 0) {
    return items.map((n) => (
      <div className="journal-tree-note-shell" key={n.id}>
        {batchMode && (
          <input
            type="checkbox"
            aria-label={`选中${noteTitle(n)}`}
            checked={selectedIds.includes(n.id)}
            onChange={(e) =>
              setSelectedIds(
                e.target.checked ? [...selectedIds, n.id] : selectedIds.filter((id) => id !== n.id)
              )
            }
          />
        )}
        <button
          key={n.id}
          className={`journal-tree-note ${draft?.id === n.id ? 'selected' : ''}`}
          style={{ paddingLeft: 18 + depth * 15 }}
          onClick={() => {
            void switchNote(n)
            setDrawer(false)
          }}
          title={noteTitle(n)}
          aria-current={draft?.id === n.id ? 'page' : undefined}
        >
          <FileText size={18} />
          <span>{noteTitle(n)}</span>
        </button>
      </div>
    ))
  }
  const [folderActions, setFolderActions] = useState<JournalFolder | null>(null)
  function openFolderActions(f: JournalFolder) {
    setFolderActions(f)
  }
  const modalOpen = !!(form || confirm || folderActions || templateOpen)
  useEffect(() => {
    if (!modalOpen) return
    const previous = document.activeElement as HTMLElement | null
    const modal = document.querySelector<HTMLElement>('.journal-modal')
    const controls = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled)'
        ) ?? []
      )
    controls()[0]?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = controls()
      const first = items[0],
        last = items.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      previous?.focus()
    }
  }, [modalOpen, form?.title, confirm?.text, folderActions?.id, templateOpen])

  const moveNotes = (ids: string[]) =>
    openForm({
      title: `移动${ids.length}篇记录`,
      folders: true,
      parentId: draft?.folderId ?? null,
      submit: async (_, folderId) => {
        await act({ kind: 'noteMove', ids, folderId })
        setSelectedIds([])
        setSearch('')
      }
    })
  async function persistAttachment(id: string, name: string, mime: string, bytes: Uint8Array) {
    await mutate(async () => {
      await window.api.journal.attach(id, name, mime, bytes)
      const s = await window.api.journal.list()
      setState(s)
      const saved = s.notes.find((n) => n.id === id)
      if (saved && draftRef.current?.id === id) {
        const next = {
          ...draftRef.current,
          revision: saved.revision,
          attachments: saved.attachments
        }
        draftRef.current = next
        setDraft(next)
      }
    })
  }
  async function attachFile(file: File) {
    const id = draftRef.current?.id
    if (!id) return
    setMediaOpen(true)
    await persistAttachment(
      id,
      file.name,
      file.type.split(';')[0],
      new Uint8Array(await file.arrayBuffer())
    )
  }
  async function startRecording() {
    if (!draftRef.current || disabled) return
    await flush()
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      throw new Error('当前环境不支持录音')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t)
    )
    if (!mime) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('未找到支持的录音格式')
    }
    const r = new MediaRecorder(stream, { mimeType: mime })
    recorder.current = r
    const recovery = {
      id: crypto.randomUUID(),
      noteId: draftRef.current.id,
      mime,
      chunks: [] as Blob[],
      updatedAt: Date.now()
    }
    let writing = Promise.resolve()
    let failed = false
    r.ondataavailable = (e) => {
      if (!e.data.size) return
      recovery.chunks.push(e.data)
      recovery.updatedAt = Date.now()
      writing = writing
        .then(() => recordingStore.save(recovery))
        .then(() => {})
        .catch((e) => {
          failed = true
          setError(`录音恢复保存失败：${message(e)}`)
        })
    }
    r.onerror = () => setError('录音中断，已保存片段可在恢复区找回')
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      setRecording(false)
      setPaused(false)
      void (async () => {
        await writing
        try {
          await flush()
          const blob = new Blob(recovery.chunks, { type: mime })
          await persistAttachment(
            recovery.noteId,
            `语音备忘 ${new Date().toLocaleString()}`,
            mime.split(';')[0],
            new Uint8Array(await blob.arrayBuffer())
          )
          await recordingStore.remove(recovery.id)
          setNotice('录音已保存，可以试听。')
        } catch (e) {
          setError(`录音保存失败，保留恢复副本：${message(e)}`)
        } finally {
          recorder.current = null
          setRecoveries(await recordingStore.list())
          if (failed) setNotice('请试听并确认录音内容完整')
        }
      })()
    }
    try {
      await recordingStore.save(recovery)
      r.start(3000)
      setMediaOpen(true)
      setRecording(true)
      setSeconds(0)
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      throw e
    }
  }
  const stopRequired = () => {
    if (recorder.current) throw new Error('请先停止录音并等待保存')
  }
  return (
    <div className="journal-page">
      {error && (
        <div className="journal-error" role="alert">
          {error}
          <button onClick={() => setError('')}>关闭</button>
        </div>
      )}
      {notice && (
        <div className="journal-notice" role="status">
          {notice}
          <button onClick={() => setNotice('')}>关闭</button>
        </div>
      )}
      {!!recoveries.length && (
        <section className="journal-recoveries">
          <strong>发现未保存的录音片段</strong>
          {recoveries.map((r) => (
            <div key={r.id}>
              录音 · {new Date(r.updatedAt).toLocaleString()}
              <button
                className="btn btn-sm"
                onClick={() =>
                  run(async () => {
                    await flush()
                    const blob = new Blob(r.chunks, { type: r.mime })
                    await persistAttachment(
                      r.noteId,
                      '恢复的语音备忘',
                      r.mime.split(';')[0],
                      new Uint8Array(await blob.arrayBuffer())
                    )
                    await recordingStore.remove(r.id)
                    setRecoveries(await recordingStore.list())
                    const s = await window.api.journal.list()
                    setState(s)
                  })
                }
              >
                恢复保存
              </button>
              <button
                className="btn btn-sm"
                onClick={() =>
                  setConfirm({
                    text: '永久丢弃这段录音片段？',
                    action: async () => {
                      await recordingStore.remove(r.id)
                      setRecoveries(await recordingStore.list())
                    }
                  })
                }
              >
                丢弃
              </button>
            </div>
          ))}
        </section>
      )}
      <div
        className={`journal-workspace ${treeHidden ? 'tree-hidden' : ''} ${focused ? 'journal-focused' : ''}`}
      >
        {drawer && (
          <button
            className="journal-scrim"
            aria-label="关闭文件夹"
            onClick={() => setDrawer(false)}
          />
        )}
        <aside className={`journal-tree ${drawer ? 'drawer-open' : ''}`}>
          <div className="journal-pane-title">
            <strong>笔记</strong>
            <button
              className="journal-icon"
              title="新建文件夹"
              aria-label="新建文件夹"
              onClick={() =>
                openForm({
                  title: '新建文件夹',
                  parentId: null,
                  folders: true,
                  submit: async (name, parentId) => {
                    await act({ kind: 'folderCreate', name, parentId })
                  }
                })
              }
            >
              ＋
            </button>
            <button
              className="journal-icon"
              aria-label="收起文件夹栏"
              aria-expanded={!treeHidden}
              onClick={() => {
                setTreeHidden(true)
                setDrawer(false)
              }}
            >
              <SidebarSimple size={18} />
            </button>
          </div>
          <input
            aria-label="搜索记录"
            placeholder="搜索笔记…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
          />
          <button
            className="btn journal-new-note"
            disabled={busy || !loaded || recording}
            onClick={() =>
              run(async () => {
                stopRequired()
                await act({ kind: 'noteCreate', folderId })
              })
            }
          >
            <Plus size={18} /> 新建笔记
          </button>
          <details className="journal-library-options">
            <summary>笔记管理</summary>{' '}
            <div className="journal-tools">
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    stopRequired()
                    await flush()
                    const r = await window.api.journal.import(folderId)
                    if (!r.cancelled) {
                      const s = await window.api.journal.list()
                      setState(s)
                      setNotice(r.message)
                    }
                  })
                }
              >
                导入
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await flush()
                    const r = await window.api.journal.export(folderId)
                    if (!r.cancelled) setNotice(r.message)
                  })
                }
              >
                {folderId ? '导出文件夹' : '导出全部'}
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !loaded || recording}
                onClick={() =>
                  run(async () => {
                    stopRequired()
                    await act({ kind: 'noteCreate', folderId })
                  })
                }
              >
                ＋ 新建记录
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy || !loaded || recording}
                onClick={() => {
                  if (!recorder.current) setTemplateOpen(true)
                }}
              >
                按模板新建
              </button>
            </div>
            <div className="journal-filters">
              {[
                ['all', '全部'],
                ['text', '文字'],
                ['audio', '含录音']
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? 'selected' : ''}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => {
                  setBatchMode(e.target.checked)
                  setSelectedIds([])
                }}
              />{' '}
              批量选择
            </label>
            {!!selectedIds.length && (
              <button className="btn btn-sm" onClick={() => moveNotes(selectedIds)}>
                移动选中 {selectedIds.length} 篇
              </button>
            )}
          </details>
          <nav aria-label="笔记文件夹">
            <button className={view === 'all' ? 'selected' : ''} onClick={() => chooseView('all')}>
              <Notebook />
              全部记录
            </button>
            <button
              className={view === 'unfiled' ? 'selected' : ''}
              onClick={() => chooseView('unfiled')}
            >
              <Folder />
              未分类
            </button>
          </nav>
          <div className="journal-tree-scroll">
            {search || filter !== 'all' || ['unfiled', 'archived', 'trash'].includes(view) ? (
              noteNodes(notes)
            ) : (
              <>
                {folderNodes(null)}
                {noteNodes(notes.filter((n) => !n.folderId))}
              </>
            )}
            {!notes.length && (
              <p className="journal-empty">{loaded ? '这里还没有笔记' : '正在载入…'}</p>
            )}
          </div>
          <nav className="journal-special">
            <button
              className={view === 'archived' ? 'selected' : ''}
              onClick={() => chooseView('archived')}
            >
              <Archive />
              已归档
            </button>
            <button
              className={view === 'trash' ? 'selected' : ''}
              onClick={() => chooseView('trash')}
            >
              <Trash />
              回收站
            </button>
          </nav>
          {view === 'archived' &&
            state.folders
              .filter((f) => f.archived && !f.deleted)
              .map((f) => (
                <div className="journal-restore-folder" key={f.id}>
                  {path(f.id)}
                  <button
                    onClick={() =>
                      run(() => act({ kind: 'folderArchive', id: f.id, value: false }))
                    }
                  >
                    恢复
                  </button>
                </div>
              ))}
          {view === 'trash' &&
            state.folders
              .filter((f) => f.deleted)
              .map((f) => (
                <div className="journal-restore-folder" key={f.id}>
                  {f.name}
                  <button
                    onClick={() => run(() => act({ kind: 'folderDelete', id: f.id, value: false }))}
                  >
                    恢复目录
                  </button>
                </div>
              ))}
        </aside>
        <div className="journal-rail">
          <button
            aria-label="展开文件夹栏"
            title="展开文件夹栏"
            aria-expanded={!treeHidden}
            onClick={() => {
              setTreeHidden(false)
              setDrawer(window.matchMedia('(max-width: 760px)').matches)
            }}
          >
            <Folder size={20} />
          </button>
        </div>
        <section
          className="journal-editor-pane"
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
            if (dirtyRef.current) void flush().catch((e) => setError(message(e)))
          }}
        >
          <div className="journal-editor-top">
            <button
              className="journal-icon journal-mobile-tree"
              aria-label="打开文件夹"
              onClick={() => setDrawer(true)}
            >
              <Folder />
            </button>
            <span>
              {draft ? `${path(draft.folderId)} / ${draft.title || '未命名记录'}` : '笔记'}
            </span>
            {draft && (
              <button className="journal-save-status" onClick={() => run(flush)}>
                {saveStatus}
              </button>
            )}
            <button
              className="journal-icon"
              title={focused ? '退出专注书写' : '专注书写'}
              aria-label={focused ? '退出专注书写' : '专注书写'}
              aria-pressed={focused}
              onClick={toggleFocus}
            >
              <ArrowsOutSimple size={18} />
            </button>
          </div>
          {!draft ? (
            <div className="journal-welcome">
              <Notebook size={46} weight="thin" />
              <h2>写下今天的一点收获</h2>
              <p>文字、声音，都值得被留住。</p>
              <button
                className="btn btn-primary"
                disabled={!loaded || busy}
                onClick={() => run(() => act({ kind: 'noteCreate', folderId }))}
              >
                开始写
              </button>
              <button
                className="btn"
                disabled={!loaded || busy}
                onClick={() => setTemplateOpen(true)}
              >
                按模板新建
              </button>
            </div>
          ) : (
            <>
              <div className="journal-note-meta">
                <small>{new Date(draft.createdAt).toLocaleDateString('zh-CN')}</small>
              </div>
              {disabled && (
                <p className="journal-readonly">
                  {draft.deleted || journalFolderHidden(state, draft.folderId, 'deleted')
                    ? '记录在回收站中，请先恢复。'
                    : '此文件夹已归档，恢复后可继续编辑。'}
                </p>
              )}
              <input
                className="journal-title-input"
                aria-label="记录标题"
                placeholder="给这篇记录起个名字"
                disabled={disabled}
                value={draft.title}
                onChange={(e) => change({ title: e.target.value })}
              />
              <input
                className="journal-tag-input"
                aria-label="标签，用逗号分隔"
                placeholder="添加标签，用逗号分隔"
                disabled={disabled}
                value={draft.tags.join(',')}
                onChange={(e) => change({ tags: e.target.value.split(/[,，]/) })}
              />
              <div className="journal-writing-scroll">
                <MarkdownEditor
                  key={`${draft.id}:${disabled}`}
                  initialValue={draft.markdown}
                  disabled={disabled}
                  onChange={(markdown) => change({ markdown })}
                />
                <section
                  className={`journal-attachments ${mediaOpen || recording ? 'is-open' : ''}`}
                >
                  <div className="journal-pane-title">
                    <h3>录音与图片</h3>

                    <label className={`btn btn-sm ${disabled ? 'disabled' : ''}`}>
                      添加附件
                      <input
                        ref={attachmentInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav"
                        disabled={disabled || recording}
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void run(() => attachFile(file))
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  {recording && (
                    <div className="journal-recording" role="status">
                      <span className={paused ? '' : 'journal-recording-dot'} />
                      {paused ? '已暂停' : '录音中'} {Math.floor(seconds / 60)}:
                      {String(seconds % 60).padStart(2, '0')}
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          const r = recorder.current
                          if (!r) return
                          if (r.state === 'recording') {
                            r.pause()
                            setPaused(true)
                          } else if (r.state === 'paused') {
                            r.resume()
                            setPaused(false)
                          }
                        }}
                      >
                        暂停 / 继续
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          recorder.current?.stop()
                          setNotice('正在保存录音…')
                        }}
                      >
                        停止并保存
                      </button>
                      {seconds >= 1740 && <small>即将达到30分钟上限</small>}
                    </div>
                  )}
                  {draft.attachments.map((a) => (
                    <div className="journal-attachment" key={a.id}>
                      <JournalMedia attachment={a} />
                      {!disabled && (
                        <button
                          className="journal-icon"
                          aria-label={`删除附件${a.name}`}
                          disabled={recording}
                          onClick={() =>
                            setConfirm({
                              text: `从笔记移除附件「${a.name}」？`,
                              action: async () => {
                                await act({
                                  kind: 'attachmentRemove',
                                  id: draft.id,
                                  attachmentId: a.id
                                })
                              }
                            })
                          }
                        >
                          <Trash />
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              </div>
              <footer className="journal-editor-footer">
                <small>{draft.markdown.replace(/\s/g, '').length}字</small>
                <div className="journal-footer-actions">
                  <button
                    className="journal-icon"
                    title="录一段"
                    aria-label="录一段"
                    disabled={disabled || busy || recording || !!recorder.current}
                    onClick={() => run(startRecording)}
                  >
                    <Microphone size={21} />
                  </button>
                  <button
                    className="journal-icon"
                    title="添加附件"
                    aria-label="添加附件"
                    disabled={disabled || recording}
                    onClick={() => attachmentInput.current?.click()}
                  >
                    <Paperclip size={21} />
                  </button>
                  {!!draft.attachments.length && (
                    <button
                      className="journal-media-toggle"
                      aria-expanded={mediaOpen}
                      onClick={() => setMediaOpen(!mediaOpen)}
                    >
                      附件 {draft.attachments.length}
                    </button>
                  )}
                  <details className="journal-note-actions">
                    <summary aria-label="笔记操作">
                      <DotsThree size={22} />
                    </summary>
                    <div>
                      <button
                        className="btn btn-sm"
                        disabled={busy || recording || !draft.markdown.trim()}
                        onClick={() =>
                          openForm({
                            title: '保存为模板',
                            name: draft.title,
                            submit: async (name) => {
                              await act({ kind: 'templateSave', name, noteId: draft.id })
                              setNotice('模板已保存，可在按模板新建中使用。')
                            }
                          })
                        }
                      >
                        保存为模板
                      </button>
                      {!(
                        draft.deleted || journalFolderHidden(state, draft.folderId, 'deleted')
                      ) && (
                        <button
                          className="btn btn-sm"
                          disabled={busy || recording}
                          onClick={() =>
                            run(async () => {
                              await flush()
                              const r = await window.api.journal.export(null, draft.id)
                              if (!r.cancelled) setNotice(r.message)
                            })
                          }
                        >
                          导出记录
                        </button>
                      )}

                      {!disabled && (
                        <>
                          <button
                            className="btn btn-sm"
                            disabled={recording}
                            onClick={() => moveNotes([draft.id])}
                          >
                            移动
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={recording}
                            onClick={() =>
                              setConfirm({
                                text: '将这篇记录移入回收站？已有成长值会保留。',
                                action: async () => {
                                  await act({ kind: 'noteDelete', id: draft.id, value: true })
                                }
                              })
                            }
                          >
                            删除
                          </button>
                        </>
                      )}
                      {(draft.deleted || journalFolderHidden(state, draft.folderId, 'deleted')) && (
                        <>
                          {draft.deleted && (
                            <button
                              className="btn btn-sm"
                              onClick={() =>
                                run(() => act({ kind: 'noteDelete', id: draft.id, value: false }))
                              }
                            >
                              恢复记录
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              setConfirm({
                                text: '永久删除这篇记录？此操作无法恢复。',
                                action: async () => {
                                  await act({ kind: 'notePurge', id: draft.id })
                                }
                              })
                            }
                          >
                            永久删除
                          </button>
                        </>
                      )}
                    </div>
                  </details>
                  {!disabled && (
                    <button
                      className="btn btn-primary"
                      disabled={busy || recording || !!draft.completedAt}
                      onClick={() => run(() => act({ kind: 'noteComplete', id: draft.id }))}
                    >
                      {draft.completedAt
                        ? draft.source === 'local'
                          ? '已完成记录'
                          : '已完成记录'
                        : draft.source === 'local'
                          ? '完成记录'
                          : '完成记录'}
                    </button>
                  )}
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
      {templateOpen && (
        <TemplatePicker
          templates={[...JOURNAL_TEMPLATES, ...(state.templates ?? [])]}
          destination={folderId ? path(folderId) : '未分类'}
          busy={busy}
          onClose={() => setTemplateOpen(false)}
          onCreate={(templateId) =>
            run(async () => {
              stopRequired()
              await act({ kind: 'noteCreate', folderId, templateId })
              setTemplateOpen(false)
            })
          }
          onDelete={(id) =>
            run(async () => {
              await act({ kind: 'templateDelete', id })
            })
          }
        />
      )}
      {folderActions && (
        <div className="journal-modal-backdrop" onClick={() => setFolderActions(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="文件夹操作"
            className="journal-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{folderActions.name}</h2>
            {[
              [
                '新建子文件夹',
                () =>
                  openForm({
                    title: '新建子文件夹',
                    parentId: folderActions.id,
                    folders: true,
                    submit: async (name, parentId) => {
                      await act({ kind: 'folderCreate', name, parentId })
                    }
                  })
              ],
              [
                '重命名 / 移动文件夹',
                () =>
                  openForm({
                    title: '编辑文件夹',
                    name: folderActions.name,
                    parentId: folderActions.parentId,
                    folders: true,
                    submit: async (name, parentId) => {
                      await act({ kind: 'folderEdit', id: folderActions.id, name, parentId })
                    }
                  })
              ],
              [
                folderActions.archived ? '恢复归档' : '归档整个文件夹',
                () => {
                  void run(() =>
                    act({
                      kind: 'folderArchive',
                      id: folderActions.id,
                      value: !folderActions.archived
                    })
                  )
                }
              ],
              [
                '导出文件夹',
                () => {
                  void run(async () => {
                    await flush()
                    const r = await window.api.journal.export(folderActions.id)
                    setNotice(r.message)
                  })
                }
              ],
              [
                '整组移入回收站',
                () =>
                  setConfirm({
                    text: `「${folderActions.name}」及其子目录、笔记将一起移入回收站，可整组恢复。`,
                    action: async () => {
                      stopRequired()
                      await act({ kind: 'folderDelete', id: folderActions.id, value: true })
                      chooseView('all')
                    }
                  })
              ]
            ].map(([label, action]) => (
              <button
                className="btn"
                key={label as string}
                onClick={() => {
                  if (recorder.current) {
                    setError('请先停止录音')
                    return
                  }
                  ;(action as () => void)()
                  setFolderActions(null)
                }}
              >
                {label as string}
              </button>
            ))}
            <button className="btn btn-ghost" onClick={() => setFolderActions(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {form && (
        <div className="journal-modal-backdrop">
          <form
            className="journal-modal"
            role="dialog"
            aria-modal="true"
            aria-label={form.title}
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                stopRequired()
                await form.submit(formName, formParent || null)
                setForm(null)
              })
            }}
          >
            <h2>{form.title}</h2>
            {!form.title.startsWith('移动') && (
              <label>
                {form.title === '保存为模板' ? '模板名称' : '文件夹名称'}
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </label>
            )}
            {form.folders && (
              <label>
                目标位置
                <select value={formParent} onChange={(e) => setFormParent(e.target.value)}>
                  <option value="">{form.title.startsWith('移动') ? '未分类' : '顶层'}</option>
                  {availableFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {path(f.id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div>
              <button className="btn btn-primary" disabled={busy}>
                保存
              </button>
              <button type="button" className="btn" onClick={() => setForm(null)}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}
      {confirm && (
        <div className="journal-modal-backdrop">
          <div className="journal-modal" role="dialog" aria-modal="true" aria-label="确认操作">
            <p>{confirm.text}</p>
            <div>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    stopRequired()
                    await confirm.action()
                    setConfirm(null)
                  })
                }
              >
                确认
              </button>
              <button className="btn" onClick={() => setConfirm(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
