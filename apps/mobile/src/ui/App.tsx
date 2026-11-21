import { ArticleReader } from '@renderer/components/ArticleReader'
import { registerPlugin, Capacitor } from '@capacitor/core'
import { dismissBackLayer, backDestination } from './android-back'
import { MobileSync } from './MobileSync'
import { CloseSessionDialog } from '@renderer/components/CloseSessionDialog'
import { TrashPanel } from '@renderer/components/TrashPanel'
import { LongMarchPage } from '@renderer/features/long-march/LongMarchPage'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { HashRouter, Route, Routes, useNavigate, useLocation, useMatch } from 'react-router-dom'
import {
  House,
  Books,
  SquaresFour,
  Compass,
  Notebook,
  UserCircle,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  MagnifyingGlass,
  CaretRight,
  X
} from '@phosphor-icons/react'
import { ActionsPage } from '@renderer/pages/ActionsPage'
import { ActionHubProvider } from '@renderer/features/actions/ActionHub'
import { SessionPage } from '@renderer/pages/SessionPage'
import { JournalPage } from '@renderer/features/journal/JournalPage'
import { MarkdownEditor } from '@renderer/features/journal/MarkdownEditor'
import { NewSessionDialog } from '@renderer/components/NewSessionDialog'
import type { SessionSummary, Settings, SessionMode } from '@shared/types'
import { MODE_META } from '@shared/types'
import type { AppClient } from '../application/client'
import type { Article } from '../domain/models'
import { paragraphs } from '../domain/models'
import { refreshBooks } from '@renderer/features/library/useBooks'

const FONT_SIZE_KEY = 'maoxuan.mobile.fontSize'
const FONT_SIZES = [
  { label: '小', value: '0.875' },
  { label: '标准', value: '1' },
  { label: '大', value: '1.2' }
] as const
type FontSize = (typeof FONT_SIZES)[number]['value']

function loadFontSize(): FontSize {
  try {
    const saved = localStorage.getItem(FONT_SIZE_KEY)
    return FONT_SIZES.find(({ value }) => value === saved)?.value ?? '1'
  } catch {
    return '1'
  }
}

export function App({
  client,
  native,
  refresh
}: {
  client: AppClient
  native: boolean
  refresh: () => Promise<void>
}) {
  return (
    <HashRouter>
      <ActionHubProvider>
        <MobileApp client={client} native={native} refresh={refresh} />
      </ActionHubProvider>
    </HashRouter>
  )
}
function MobileApp({
  client,
  native,
  refresh
}: {
  client: AppClient
  native: boolean
  refresh: () => Promise<void>
}) {
  const navigate = useNavigate(),
    location = useLocation()
  const [tab, setTab] = useState('home'),
    [sessions, setSessions] = useState<SessionSummary[]>([]),
    [articles, setArticles] = useState<Article[]>([]),
    [error, setError] = useState(''),
    [create, setCreate] = useState(false),
    [createMode, setCreateMode] = useState<SessionMode>('reading')
  const openedSession = useMatch('/session/:id')
  const activeSession = sessions.find((session) => session.id === openedSession?.params.id)
  const [closingSession, setClosingSession] = useState<SessionSummary | null>(null)
  const closeQuestion = activeSession ? () => setClosingSession(activeSession) : undefined
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncSettingsSlot, setSyncSettingsSlot] = useState<HTMLDivElement | null>(null)
  const [fontSize, setFontSize] = useState(loadFontSize)
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--mobile-font-scale', fontSize)
    try {
      localStorage.setItem(FONT_SIZE_KEY, fontSize)
    } catch {
      // The selection still applies for this visit.
    }
  }, [fontSize])
  const [query, setQuery] = useState(''),
    [volume, setVolume] = useState('全部'),
    [article, setArticle] = useState<Article>(),
    [paragraph, setParagraph] = useState(0),
    [quoteNote, setQuoteNote] = useState<{ title: string; markdown: string }>()
  const readerArticle = useMemo(() => {
    if (!article) return undefined
    const body = paragraphs(article)
    return {
      ...article,
      bookId: article.volume === '导入书籍' ? article.id : 'maoxuan',
      length: article.content.length,
      paragraphs: body,
      paragraphIds: body.map((_, index) => `${article.id}:p${index}`)
    }
  }, [article])
  const input = useRef<HTMLInputElement>(null)
  const [settings, setSettings] = useState<Settings>({
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat'
    }),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  async function reload() {
    await refresh()
    setSessions(await window.api.sessions.list())
    setArticles(client.articlesFrom((await client.snapshot()).entities))
  }
  useEffect(() => {
    void reload().catch((e) => setError(String(e)))
    void window.api.settings.get().then(setSettings)
    const changed = () => {
      void reload().catch((e) => setError(String(e)))
    }
    window.addEventListener('sessions-changed', changed)
    window.addEventListener('hashchange', changed)
    return () => {
      window.removeEventListener('sessions-changed', changed)
      window.removeEventListener('hashchange', changed)
    }
  }, [])
  useEffect(() => {
    setClosingSession(null)
  }, [location.pathname])
  useEffect(() => {
    if (location.pathname === '/actions') {
      setTab('todo')
      navigate('/', { replace: true })
    }
  }, [location.pathname, navigate])
  const go = (t: string) => {
    setTab(t)
    setQuery('')
    navigate('/')
    window.scrollTo(0, 0)
  }
  const backing = useRef(false)
  useEffect(() => {
    const back = async () => {
      if (backing.current) return
      backing.current = true
      try {
        if (quoteNote) {
          setQuoteNote(undefined)
          return
        }
        if (dismissBackLayer(document)) return
        if (create) {
          setCreate(false)
          return
        }
        if (article) {
          setArticle(undefined)
          return
        }
        ;(document.activeElement as HTMLElement | null)?.blur()
        await Promise.resolve()
        const pending: Promise<unknown>[] = []
        const request = new CustomEvent('maoxuan-before-back', {
          cancelable: true,
          detail: { waitUntil: (job: Promise<unknown>) => pending.push(job) }
        })
        window.dispatchEvent(request)
        await Promise.all(pending)
        if (request.defaultPrevented) return
        const destination = backDestination(
          window.location.hash.slice(1).split('?')[0] || location.pathname,
          tab
        )
        if (destination) {
          if (destination.tab) setTab(destination.tab)
          navigate(destination.path)
          return
        }
        if (Capacitor.getPlatform() === 'android')
          await registerPlugin<{ minimize(): Promise<void> }>('LanSync').minimize()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        backing.current = false
      }
    }
    const handler = () => void back()
    window.addEventListener('maoxuan-back', handler)
    return () => window.removeEventListener('maoxuan-back', handler)
  }, [location.pathname, tab, create, article, quoteNote, navigate])
  const start = (m: SessionMode = 'reading') => {
    setCreateMode(m)
    setCreate(true)
  }
  async function run(job: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await job()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const compactOverview = tab === 'home' || tab === 'practice'
  const openSession = (id: string) => navigate(`/session/${id}`)
  const nav = [
    ['home', '首页', House],
    ['practice', '实践', Compass],
    ['todo', '待办', SquaresFour],
    ['notes', '记录', Notebook],
    ['profile', '我的', UserCircle]
  ] as const
  return (
    <div className={`app ${tab === 'notes' ? 'journal-mobile-shell' : ''}`}>
      <Routes>
        <Route
          path="/achievements"
          element={
            <>
              <button className="workspace-back" onClick={() => go('home')}>
                返回首页
              </button>
              <LongMarchPage />
            </>
          }
        />
        <Route path="/long-march" element={<LongMarchPage />} />
        <Route path="/long-march/album" element={<LongMarchPage />} />
        <Route path="/long-march/:nodeId/scenery" element={<LongMarchPage />} />
        <Route
          path="/journal"
          element={
            <div className="desktop-journal">
              <button onClick={() => go('home')}>返回首页</button>
              <JournalPage mobile />
            </div>
          }
        />
        <Route path="/long-march/:nodeId" element={<LongMarchPage />} />
        <Route
          path="/session/:id"
          element={
            <div className="desktop-workspace">
              <div className="workspace-back">
                <button onClick={() => go('practice')}>
                  <ArrowLeft />
                  我的问题
                </button>
                <button
                  onClick={() => {
                    go('profile')
                  }}
                >
                  AI 服务设置
                </button>
                {closeQuestion && (
                  <button className="workspace-close-question" onClick={closeQuestion}>
                    关闭问题
                  </button>
                )}
              </div>
              <SessionPage
                mobileReading
                onBack={() => go('practice')}
                onCloseQuestion={closeQuestion}
              />
              {closingSession && closingSession.id === openedSession?.params.id && (
                <CloseSessionDialog
                  session={closingSession}
                  mobile
                  onClose={() => setClosingSession(null)}
                  onDone={() => {
                    setSessions((items) => items.filter((item) => item.id !== closingSession.id))
                    setClosingSession(null)
                    go('practice')
                    window.dispatchEvent(new Event('sessions-changed'))
                  }}
                />
              )}
            </div>
          }
        />
        <Route
          path="*"
          element={
            <>
              <header className={compactOverview ? 'topbar compact-topbar' : 'topbar'}>
                <button className="brand" onClick={() => go('home')}>
                  <span className="brand-mark">毛</span>
                  <span>
                    毛选 <em>随身读</em>
                  </span>
                </button>
                <span className="local-status">
                  <i />
                  本地优先
                </span>
              </header>
              {tab === 'notes' ? (
                <div className="desktop-journal">
                  <JournalPage mobile />
                </div>
              ) : tab === 'todo' ? (
                <div className="desktop-actions">
                  <ActionsPage mobile />
                </div>
              ) : (
                <main className={compactOverview ? 'mobile-overview' : undefined}>
                  {tab === 'home' && (
                    <>
                      <h1 className="home-intro">带着问题读，在实践中找到答案。</h1>
                      <section aria-labelledby="home-start">
                        <h2 className="overview-section-title" id="home-start">
                          开始实践
                        </h2>
                        <div className="mode-grid">
                          {(['reading', 'workbench'] as const).map((m) => (
                            <button key={m} className="mode-entry" onClick={() => start(m)}>
                              <span className="mode-entry-title">
                                {MODE_META[m].name} <ArrowUpRight size={16} aria-hidden="true" />
                              </span>
                              <span className="overview-caption">
                                {m === 'reading' ? '带着问题读原文' : '分析处境，形成行动'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                      <section aria-labelledby="home-recent">
                        <div className="overview-heading">
                          <h2 className="overview-section-title" id="home-recent">
                            继续我的问题
                          </h2>
                          <button className="text-link" onClick={() => go('practice')}>
                            全部问题 <CaretRight aria-hidden="true" />
                          </button>
                        </div>
                        {sessions.length ? (
                          <SessionList sessions={sessions.slice(0, 4)} onOpen={openSession} />
                        ) : (
                          <p className="overview-caption">创建一个问题后，可以在这里继续。</p>
                        )}
                      </section>
                      <div className="home-utilities">
                        <button onClick={() => go('library')}>
                          <Books size={18} aria-hidden="true" />
                          我的书架
                          <CaretRight size={14} aria-hidden="true" />
                        </button>
                        <button onClick={() => navigate('/achievements')}>
                          <Compass size={18} aria-hidden="true" />
                          我的成就
                          <CaretRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                  {tab === 'practice' && (
                    <>
                      <div className="overview-heading practice-heading">
                        <h1>实践</h1>
                        <button className="primary" onClick={() => start()}>
                          <Plus size={16} aria-hidden="true" />
                          新建问题
                        </button>
                      </div>
                      {sessions.length ? (
                        <section aria-labelledby="practice-recent">
                          <h2 className="overview-caption" id="practice-recent">
                            最近更新
                          </h2>
                          <SessionList sessions={sessions} onOpen={openSession} />
                        </section>
                      ) : (
                        <p className="overview-caption">还没有问题。点「新建问题」开始实践。</p>
                      )}
                    </>
                  )}
                  {tab === 'library' && (
                    <>
                      <div className="page-heading">
                        <div>
                          <div className="eyebrow">READ THE ORIGINAL</div>
                          <h1>书架</h1>
                          <p>选章、逐段阅读，把原文带回你的问题。</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="导入 TXT"
                          onClick={() => input.current?.click()}
                        >
                          <Plus />
                        </button>
                      </div>
                      <label className="search">
                        <MagnifyingGlass />
                        <input
                          aria-label="搜索篇名或正文"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="搜索篇名或正文…"
                        />
                      </label>
                      <div className="chips">
                        {['全部', '核心五篇', ...new Set(articles.map((a) => a.volume))].map(
                          (v) => (
                            <button
                              key={v}
                              onClick={() => setVolume(v)}
                              className={v === volume ? 'selected' : ''}
                            >
                              {v}
                            </button>
                          )
                        )}
                      </div>
                      {articles
                        .filter(
                          (a) =>
                            (volume === '全部' ||
                              (volume === '核心五篇' ? a.isCore : a.volume === volume)) &&
                            `${a.title}${a.content}`.includes(query)
                        )
                        .map((a, i) => (
                          <button
                            key={a.id}
                            className="article-row"
                            onClick={() => {
                              setArticle(a)
                              setParagraph(0)
                            }}
                          >
                            <span className="row-number">{i + 1}</span>
                            <div>
                              <h3>{a.title}</h3>
                              <p>{a.volume}</p>
                            </div>
                            <CaretRight />
                          </button>
                        ))}
                    </>
                  )}
                  {tab === 'profile' && (
                    <>
                      <div ref={setSyncSettingsSlot} />
                      <div className="page-heading">
                        <div>
                          <div className="eyebrow">YOUR READING COACH</div>
                          <h1>我的</h1>
                          <p>配置教练，围绕真实问题分析、阅读和实践。</p>
                        </div>
                      </div>
                      <section className="settings-card general-settings">
                        <h2>总体设置</h2>
                        <fieldset className="font-size-setting">
                          <legend>字体大小</legend>
                          <div>
                            {FONT_SIZES.map(({ label, value }) => (
                              <label key={value}>
                                <input
                                  type="radio"
                                  name="mobile-font-size"
                                  checked={fontSize === value}
                                  onChange={() => setFontSize(value)}
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </section>
                      <section className="settings-card ai-config">
                        <h2>AI 服务</h2>
                        <p className="helper">
                          兼容 OpenAI Chat Completions 的服务。
                          {native
                            ? '密钥由系统安全存储保管。'
                            : '浏览器密钥只保留在当前页面内存中，刷新后需重新填写；服务商需允许浏览器跨域请求。'}
                        </p>
                        <label>
                          服务地址
                          <input
                            value={settings.baseUrl}
                            onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                          />
                        </label>
                        <label>
                          模型
                          <input
                            value={settings.model}
                            onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                          />
                        </label>
                        <label>
                          API Key
                          <input
                            type="password"
                            autoComplete="off"
                            value={settings.apiKey}
                            placeholder={
                              settings.hasApiKey ? '已配置，留空保留现有密钥' : '填写自己的 API Key'
                            }
                            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                          />
                        </label>
                        <div className="form-footer">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                setSettings(await window.api.settings.set(settings))
                                setNotice('AI 配置已保存')
                              })
                            }
                          >
                            保存 AI 配置
                          </button>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await window.api.settings.set(settings)
                                setNotice((await window.api.settings.test()).message)
                                setSettings(await window.api.settings.get())
                              })
                            }
                          >
                            测试连接
                          </button>
                        </div>
                        {notice && (
                          <p role="status" className="helper">
                            {notice}
                          </p>
                        )}
                      </section>
                      <details className="settings-card mobile-question-history">
                        <summary>问题归档与回收站</summary>
                        <TrashPanel mobile />
                      </details>
                      <section className="path-card">
                        <h2>数据与备份</h2>
                        <p>问题、工作台、Markdown 记录都保存在本机。备份不含 API Key。</p>
                        <button
                          className="secondary"
                          onClick={() =>
                            run(async () => {
                              const text = await client.exportBackup()
                              if (native) {
                                const { shareBackup } = await import('../adapters/backup')
                                await shareBackup(text, 'maoxuan-backup.json')
                              } else {
                                const url = URL.createObjectURL(
                                  new Blob([text], { type: 'application/json' })
                                )
                                const a = document.createElement('a')
                                a.href = url
                                a.download = 'maoxuan-backup.json'
                                a.click()
                                setTimeout(() => URL.revokeObjectURL(url), 1000)
                              }
                            })
                          }
                        >
                          导出本地备份
                        </button>
                        <input
                          type="file"
                          aria-label="恢复备份"
                          disabled={busy || syncBusy}
                          accept=".json"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file)
                              void run(async () => {
                                if (file.size > 20_000_000) throw new Error('备份不能超过20 MB')
                                const text = await file.text()
                                const data = await client.inspectBackup(text)
                                if (
                                  window.confirm(
                                    `备份校验通过，包含 ${data.entities.length} 条数据。确认替换当前本机内容？`
                                  )
                                ) {
                                  await client.restoreBackup(text)
                                  await reload()
                                  setNotice('备份已恢复')
                                }
                              })
                          }}
                        />
                      </section>
                    </>
                  )}
                </main>
              )}
              <nav className="bottom-nav" aria-label="主导航">
                {nav.map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    className={tab === id || (id === 'home' && tab === 'library') ? 'active' : ''}
                    aria-current={tab === id ? 'page' : undefined}
                  >
                    <Icon
                      size={24}
                      weight={
                        tab === id || (id === 'home' && tab === 'library') ? 'fill' : 'regular'
                      }
                    />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </>
          }
        />
      </Routes>
      <MobileSync
        android={native && Capacitor.getPlatform() === 'android'}
        settingsSlot={syncSettingsSlot}
        blocked={busy}
        onBusyChange={setSyncBusy}
      />
      {create && (
        <NewSessionDialog
          mobile
          initialMode={createMode}
          initialBookId="maoxuan"
          onClose={() => setCreate(false)}
          onCreated={(id) => {
            setCreate(false)
            navigate(`/session/${id}`)
            void reload()
          }}
          onImport={() => {
            setCreate(false)
            go('library')
            input.current?.click()
          }}
        />
      )}
      {article && readerArticle && (
        <div className="m-reader">
          <header className="m-reader-header">
            <button
              className="icon-button"
              aria-label="关闭阅读"
              onClick={() => setArticle(undefined)}
            >
              <ArrowLeft />
            </button>
            <span>{article.title}</span>
            <button
              className="text-link"
              onClick={() => {
                setArticle(undefined)
                start('reading')
              }}
            >
              带着问题读
            </button>
          </header>
          <div className="m-reader-content">
            <ArticleReader
              article={readerArticle}
              mobile
              onParagraphClick={setParagraph}
              activeParagraph={paragraph}
              selectParagraphOnText
            />
          </div>
          <footer className="m-reader-toolbar">
            <span>第 {paragraph + 1} 段</span>
            <button
              onClick={() =>
                setQuoteNote({
                  title: `《${article.title}》阅读笔记`,
                  markdown: `> ${paragraphs(article)[paragraph].replaceAll('\n', '\n> ')}\n\n`
                })
              }
            >
              记 Markdown 笔记
            </button>
          </footer>
        </div>
      )}
      {quoteNote && (
        <dialog open className="modal quote-editor">
          <header>
            <h2>Markdown 笔记</h2>
            <button
              className="icon-button"
              aria-label="关闭笔记"
              onClick={() => setQuoteNote(undefined)}
            >
              <X />
            </button>
          </header>
          <div className="modal-content">
            <label>
              标题
              <input
                value={quoteNote.title}
                onChange={(e) => setQuoteNote({ ...quoteNote, title: e.target.value })}
              />
            </label>
            <MarkdownEditor
              initialValue={quoteNote.markdown}
              disabled={busy}
              onChange={(markdown) => setQuoteNote((v) => (v ? { ...v, markdown } : v))}
            />
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  const created = await window.api.journal.apply({
                    kind: 'noteCreate',
                    folderId: null
                  })
                  await window.api.journal.apply({
                    kind: 'noteSave',
                    id: created.selectedId!,
                    revision: 0,
                    title: quoteNote.title,
                    markdown: quoteNote.markdown,
                    tags: []
                  })
                  setQuoteNote(undefined)
                  setArticle(undefined)
                  go('notes')
                })
              }
            >
              保存笔记
            </button>
          </div>
        </dialog>
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept=".txt,text/plain"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file)
            void run(async () => {
              await client.importText(file)
              await refresh()
              await refreshBooks()
              setVolume('导入书籍')
            })
        }}
      />
      {error && (
        <div role="alert" className="error-banner">
          <span>{error}</span>
          <button aria-label="关闭错误提示" onClick={() => setError('')}>
            <X />
          </button>
        </div>
      )}
    </div>
  )
}
function SessionList({
  sessions,
  onOpen
}: {
  sessions: SessionSummary[]
  onOpen: (id: string) => void
}) {
  return (
    <ul className="session-list" role="list">
      {sessions.map((session) => (
        <li key={session.id}>
          <button className="session-card" onClick={() => onOpen(session.id)}>
            <span className="session-card-body">
              <span className="session-card-title">{session.title}</span>
              <span className="session-card-meta overview-caption">
                <span className="tag">{MODE_META[session.mode].name}</span>
                <span>{session.versionNo} 个版本</span>
              </span>
            </span>
            <CaretRight size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
