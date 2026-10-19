import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CORE_ARTICLES, FOUR_DONTS, MOTTO } from '@shared/core'
import { STEPS } from '@shared/types'

const WRONG_WAYS = [
  '从头到尾通读全书，读完再说',
  '指望记住原文原句，把读书当背诵',
  '先看别人的解读，用别人的结论代替自己的思考',
  '读完就合上，问题照旧摆在那里'
]

const RIGHT_WAYS = [
  '先摆出自己最头疼的那一件事',
  '只读跟这件事相关的那几段原文',
  '用自己的话写 3 条，教练只批改、不代写',
  '明天就干 1 件事，干完回来复盘'
]

export function HomePage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const list = await window.api.sessions.list()
        if (!alive) return
        if (list.length > 0) {
          navigate(`/session/${list[0].id}`, { replace: true })
          return
        }
        setChecking(false)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setChecking(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [navigate])

  function startNew() {
    window.dispatchEvent(new Event('open-new-session'))
  }

  if (checking) {
    return (
      <div className="home-loading">
        <span className="spinner" />
        正在检查你的问题…
      </div>
    )
  }

  return (
    <div className="home">
      <div className="home-inner">
        <header>
          <div className="home-kicker">问题式阅读工具箱</div>
          <h1 className="home-title serif">带着问题读一本书</h1>
          <p className="home-sub">读的标准不是“看懂原文”，而是“能用在自己身上”。</p>
          <p className="home-motto">{MOTTO}</p>
          <button className="btn btn-primary home-cta" onClick={startNew}>
            ＋ 我有一个头疼的问题
          </button>
          {error ? <div className="error-text">{error}</div> : null}
        </header>

        <section className="home-compare">
          <div className="card home-wrong">
            <div className="card-title">错误方式</div>
            <ul>
              {WRONG_WAYS.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="card home-right">
            <div className="card-title">正确方式</div>
            <ul>
              {RIGHT_WAYS.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="home-h2">四步读法</h2>
          <div className="home-step-grid">
            {STEPS.map((s) => (
              <div className="card home-step" key={s.key}>
                <div className="home-step-no">{s.no}</div>
                <div className="home-step-name">{s.name}</div>
                <div className="home-step-hint muted">
                  {
                    [
                      '先写清楚一个现实问题',
                      '读相关原文，并写下感受',
                      '写出理解、联系和行动',
                      '记录结果，带着新问题再读'
                    ][s.no - 1]
                  }
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="home-h2">内置毛选：核心五篇</h2>
          <p className="home-note muted">
            毛选可先从这五篇开始。想读其他书，到原文书库导入 EPUB 或 TXT，再为新问题选择书籍。
          </p>
          <div className="home-core-grid">
            {CORE_ARTICLES.map((a) => (
              <div className="card home-core-card" key={a.articleId}>
                <div className="home-core-order">第 {a.order + 1} 篇</div>
                <div className="home-core-title">{a.title}</div>
                <div className="home-core-solves muted">解决：{a.solves}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="home-h2">四不要</h2>
          <div className="home-dont-grid">
            {FOUR_DONTS.map((d) => (
              <div className="card" key={d.title}>
                <div className="card-title">{d.title}</div>
                <div className="muted">{d.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <footer>
          <p className="home-stop">现在就停止研究“该怎么读”。</p>
        </footer>
      </div>
    </div>
  )
}
