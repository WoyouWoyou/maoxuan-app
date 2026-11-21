import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { JournalTemplate } from '@shared/journal'
export function TemplatePicker({
  templates,
  destination,
  mobileDestination,
  busy,
  onCreate,
  onDelete,
  onClose
}: {
  templates: JournalTemplate[]
  destination: string
  mobileDestination?: {
    value: string | null
    options: { id: string; name: string }[]
    onChange: (id: string | null) => void
  }
  busy: boolean
  onCreate: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(mobileDestination ? undefined : templates[0]?.id)
  const [category, setCategory] = useState('全部')
  const [query, setQuery] = useState('')
  const template = templates.find((t) => t.id === selected)
  const visible = templates.filter(
    (t) => (category === '全部' || t.category === category) && t.name.includes(query)
  )
  const previewing = !!mobileDestination && !!template
  const close = () => {
    if (previewing) setSelected(undefined)
    else onClose()
  }
  return (
    <div className="journal-modal-backdrop">
      <section
        className={`journal-modal journal-template-modal ${mobileDestination ? 'journal-template-mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="按模板新建记录"
      >
        <header>
          <div>
            <h2>按模板新建记录</h2>
            {!mobileDestination && <small>创建到：{destination}</small>}
          </div>
          <button className="btn" onClick={close}>
            {previewing ? '返回模板列表' : '关闭'}
          </button>
        </header>
        <div className="journal-template-body">
          {!previewing && (
            <aside>
              <input
                aria-label="搜索模板"
                placeholder="搜索模板…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="模板分类"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {['全部', ...new Set(templates.map((t) => t.category))].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="journal-template-options">
                {visible.map((t) => (
                  <button
                    key={t.id}
                    className={`btn ${selected === t.id ? 'selected' : ''}`}
                    aria-pressed={selected === t.id}
                    onClick={() => setSelected(t.id)}
                  >
                    <strong>{t.name}</strong>
                    <small>{t.category}</small>
                  </button>
                ))}
                {!visible.length && <p>没有匹配的模板</p>}
              </div>
            </aside>
          )}
          {previewing && mobileDestination && (
            <label className="journal-mobile-template-destination">
              保存到
              <select
                value={mobileDestination.value ?? ''}
                onChange={(e) => mobileDestination.onChange(e.target.value || null)}
              >
                <option value="">未分类</option>
                {mobileDestination.options.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(!mobileDestination || previewing) && (
            <article className="journal-template-preview">
              {template ? (
                <>
                  {(!mobileDestination || !template.markdown.trimStart().startsWith('# ')) && (
                    <h3>{template.name}</h3>
                  )}
                  <ReactMarkdown>{template.markdown}</ReactMarkdown>
                </>
              ) : (
                <p>请选择一个模板</p>
              )}
            </article>
          )}
        </div>
        {(!mobileDestination || previewing) && (
          <footer>
            {!mobileDestination && <small>模板创建为草稿，填写并保存后可获得成长值。</small>}
            <div>
              {template?.category === '我的模板' && (
                <button className="btn" disabled={busy} onClick={() => onDelete(template.id)}>
                  删除模板
                </button>
              )}
              <button
                className="btn btn-primary"
                disabled={busy || !template}
                onClick={() => template && onCreate(template.id)}
              >
                {mobileDestination ? '创建笔记' : '按此模板创建'}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}
