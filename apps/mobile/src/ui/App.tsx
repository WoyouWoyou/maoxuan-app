import { DeviceSyncPanel } from '@renderer/features/sync/DeviceSyncPanel'
import { LongMarchPage } from '@renderer/features/long-march/LongMarchPage'
import { useEffect, useRef, useState } from 'react'
import { HashRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
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
    [mode, setMode] = useState<SessionMode>('reading')
  const [query, setQuery] = useState(''),
    [volume, setVolume] = useState('全部'),
    [article, setArticle] = useState<Article>(),
    [paragraph, setParagraph] = useState(0),
    [quoteNote, setQuoteNote] = useState<{ title: string; markdown: string }>()
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
  const go = (t: string) => {
    setTab(t)
    setQuery('')
    navigate('/')
    window.scrollTo(0, 0)
  }
  const start = (m: SessionMode = 'reading') => {
    setMode(m)
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
        <Route path="/long-march/:nodeId/scenery" element={<LongMarchPage />} />
        <Route
          path="/journal"
          element={
            <div className="desktop-journal">
              <button onClick={() => go('home')}>返回首页</button>
              <JournalPage />
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
              </div>
              <SessionPage mobileReading onBack={() => go('practice')} />
            </div>
          }
        />
        <Route
          path="*"
          element={
            <>
              <header className="topbar">
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
                  <JournalPage />
                </div>
              ) : tab === 'todo' ? (
                <div className="desktop-actions">
                  <ActionsPage />
                </div>
              ) : (
                <main>
                  {tab === 'home' && (
                    <>
                      <div className="eyebrow">
                        带着问题读原文<span>明确 · 聚焦 · 联系 · 应用</span>
                      </div>
                      <section className="hero">
                        <span className="small-label">把一个真问题，带进原文与实践</span>
                        <h1>
                          带着问题读，
                          <br />
                          在实践中找到答案<span>。</span>
                        </h1>
                        <p>教练只指路，原文和笔记得你自己来。</p>
                        <button className="primary" onClick={() => start('reading')}>
                          新建阅读问题 <ArrowUpRight />
                        </button>
                      </section>
                      <button className="home-library-entry" onClick={() => go('library')}>
                        <Books size={28} />
                        <span>
                          <strong>我的书架</strong>
                          <small>原文目录 · 核心篇目 · 全文检索</small>
                        </span>
                        <CaretRight />
                      </button>
                      <button
                        className="home-library-entry"
                        onClick={() => navigate('/achievements')}
                      >
                        <Compass size={28} />
                        <span>
                          <strong>我的成就</strong>
                          <small>长征成长 · 植树 · 风景收藏</small>
                        </span>
                        <CaretRight />
                      </button>
                      <section className="mode-grid">
                        {(['reading', 'workbench'] as const).map((m) => (
                          <button key={m} className="reading-card" onClick={() => start(m)}>
                            <span className="tag">{MODE_META[m].short}</span>
                            <h2>{MODE_META[m].name}</h2>
                            <p>{MODE_META[m].desc}</p>
                            <span className="text-link">
                              开始 <ArrowUpRight />
                            </span>
                          </button>
                        ))}
                      </section>
                      <div className="section-title">
                        <h2>继续我的问题</h2>
                        <button className="text-link" onClick={() => go('practice')}>
                          全部问题 <CaretRight />
                        </button>
                      </div>
                      {sessions.length ? (
                        sessions
                          .slice(0, 4)
                          .map((s) => (
                            <SessionCard
                              key={s.id}
                              session={s}
                              onOpen={() => navigate(`/session/${s.id}`)}
                            />
                          ))
                      ) : (
                        <div className="path-card">
                          <p>从真实处境出发，用原文启发判断，再用行动检验。</p>
                          <div className="path-steps">
                            {['明确问题', '聚焦核心', '联系自身', '反复应用'].map((v, i) => (
                              <span key={v}>
                                <b>0{i + 1}</b>
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {tab === 'practice' && (
                    <>
                      <div className="page-heading">
                        <div>
                          <div className="eyebrow">READING & WORKBENCH</div>
                          <h1>实践</h1>
                          <p>从读懂自己的问题，到做出有依据的判断。</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="新增问题"
                          onClick={() => start()}
                        >
                          <Plus />
                        </button>
                      </div>
                      <div className="chips">
                        <button
                          className={mode === 'reading' ? 'selected' : ''}
                          onClick={() => setMode('reading')}
                        >
                          阅读法
                        </button>
                        <button
                          className={mode === 'workbench' ? 'selected' : ''}
                          onClick={() => setMode('workbench')}
                        >
                          毛选工作台
                        </button>
                      </div>
                      {sessions
                        .filter((s) => s.mode === mode)
                        .map((s) => (
                          <SessionCard
                            key={s.id}
                            session={s}
                            onOpen={() => navigate(`/session/${s.id}`)}
                          />
                        ))}
                      <button className="secondary" onClick={() => start(mode)}>
                        <Plus />
                        新建{MODE_META[mode].name}
                      </button>
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
                      <DeviceSyncPanel mobile onSynced={() => void reload()} />
                      <div className="page-heading">
                        <div>
                          <div className="eyebrow">YOUR READING COACH</div>
                          <h1>我的</h1>
                          <p>配置教练，围绕真实问题分析、阅读和实践。</p>
                        </div>
                      </div>
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
      {create && (
        <NewSessionDialog
          initialMode={mode}
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
      {article && (
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
            <h1>{article.title}</h1>
            {paragraphs(article).map((p, i) => (
              <p
                key={i}
                className={`paragraph ${paragraph === i ? 'focused' : ''}`}
                onClick={() => setParagraph(i)}
              >
                {p}
              </p>
            ))}
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
function SessionCard({ session: s, onOpen }: { session: SessionSummary; onOpen: () => void }) {
  return (
    <button className="reading-card" onClick={onOpen}>
      <span className="tag">{MODE_META[s.mode].name}</span>
      <h3>{s.title}</h3>
      <p>
        {s.currentStep.startsWith('wb_') ? '工作台分析' : '带着问题读原文'} · {s.versionNo}{' '}
        个历史版本 <CaretRight />
      </p>
    </button>
  )
}
