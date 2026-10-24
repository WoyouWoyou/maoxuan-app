import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'maoxuan-smoke-'))
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const server = http.createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body),
    user = payload.messages.at(-1)?.content ?? '',
    system = payload.messages[0]?.content ?? ''
  let content = { ok: true }
  if (system.includes('Phase 1 · 输入采集'))
    content = {
      facts: [{ id: 'F1', kind: 'fact', content: '已完成一次试点', confidence: 'confirmed' }],
      missing: [],
      questions: [],
      mainline: '验证试点方法',
      sideGoals: []
    }
  else if (system.includes('Agent A · 抓主要矛盾'))
    content = {
      all: ['信息不对称', '反馈不足'],
      primary: '反馈不足',
      mainAspect: '反馈缺失',
      secondaryAspect: '已有试点',
      why: 'F1说明缺少复盘',
      turningConditions: ['获得反馈'],
      focus: '访谈2位同事',
      defer: ['全量推广'],
      factRefs: ['F1'],
      missingFacts: []
    }
  else if (system.includes('Agent B · 三条路线'))
    content = {
      routes: ['steady', 'breakthrough', 'defensive'].map((key, i) => ({
        key,
        judgment: '有试点基础',
        policy: `路线${i}具体方针`,
        result: '可能获得反馈',
        triggers: ['获得反馈'],
        risks: ['样本偏差'],
        switchSignals: ['反馈变化']
      })),
      factRefs: ['F1'],
      missingFacts: []
    }
  else if (system.includes('Agent C · 主客分析法'))
    content = {
      ...Object.fromEntries(
        ['trend', 'resources', 'constraints', 'judgment', 'execution'].map((key) => [
          key,
          { score: 3, reason: 'F1提供试点依据' }
        ])
      ),
      ready: '已有试点',
      biggestGap: '反馈不足',
      firstFix: '访谈2人',
      ifNotFixed: '可能误判',
      factRefs: ['F1'],
      missingFacts: []
    }
  else if (system.includes('Phase 3 · 综合'))
    content = {
      primaryContradiction: '反馈不足',
      route: 'steady',
      routeReason: '先收集反馈',
      biggestGap: '反馈不足',
      firstBattle: '访谈2人',
      notNow: ['全面推广'],
      toInvestigate: ['试点反馈'],
      conflictsFixed: [],
      enhancements: []
    }
  else if (system.includes('Agent E · Red-team')) content = { failItems: [] }
  else if (system.includes('Agent D · Action'))
    content = {
      actions: ['7d', '30d', '90d'].map((horizon) => ({
        horizon,
        action: '访谈2位同事',
        purpose: '收集事实',
        verify: '记录2份访谈',
        standards: ['调查研究'],
        kpi: '2份记录'
      }))
    }
  else if (system.includes('当前任务】复盘纠偏'))
    content = {
      factDelta: ['已有2份访谈'],
      judgmentDelta: [],
      actionsDelta: [],
      oldAssumptionsToFix: [],
      summary: '完成第一次验证',
      newFacts: [],
      rediagnose: false,
      rediagnoseReason: ''
    }
  else if (system.includes('检索索引'))
    content = { summary: '沟通：先倾听对方需要，再描述事实和具体请求。' }
  else if (system.includes('同义表达')) content = { terms: ['沟通', '倾听', '反馈'] }
  else if (user.includes('本书真实候选：')) {
    const raw = user.split('本书真实候选：')[1].split('\n返回 ')[0],
      c = JSON.parse(raw)[0]
    content = {
      restated: '希望改善与同事的沟通。',
      symptoms: ['没有听清诉求'],
      analysis: { obstacle: '先理解双方的需要', constraints: '需验证同事的反馈' },
      recommendations: [
        {
          articleId: c.id,
          reason: '本章提供倾听和表达请求的方法。',
          focusQuestion: '我是否先听清对方的需要？',
          paragraphIndex: c.paragraphs[0].index,
          quote: c.paragraphs[0].text
        }
      ]
    }
  } else if (user.includes('原文段落：')) {
    const raw = user.split('原文段落：')[1].split('\n返回 ')[0],
      p = JSON.parse(raw)[0]
    content = {
      focusQuestion: '怎样先听清对方？',
      passages: [{ paragraphIndex: p.index, quote: p.text, why: '从事实和需要入手。' }]
    }
  } else if (user.includes('联系自身：'))
    content = {
      scores: { coreMethod: 4, relatedProblem: 4, action: 4 },
      comments: ['行动具体，可记录对方的反馈。'],
      rereadParagraphs: []
    }
  else if (user.includes('新情况：'))
    content = { rereadArticleIds: [], advice: '比较实际沟通结果，继续验证是否听清对方的需要。' }
  else if (user.includes('记录：'))
    content = {
      analysis: { obstacle: '沟通有待验证', constraints: '已有一次尝试' },
      firstStep: '再进行一次倾听练习'
    }
  if (payload.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: '先把原文里的方法和自己的处境对照起来。' }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })}\n\ndata: [DONE]\n\n`
    )
  } else {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      })
    )
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const modelPort = server.address().port
const launchApp = () =>
  spawn(require('electron'), ['.', '--remote-debugging-port=9433'], {
    env: { ...process.env, MAOXUAN_USER_DATA: root, MAOXUAN_TEST: '1', ELECTRON_RENDERER_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
let logs = ''
const collectLogs = (proc) => {
  proc.stderr.on('data', (b) => {
    logs += b
  })
  proc.stdout.on('data', (b) => {
    logs += b
  })
}
let app = launchApp()
collectLogs(app)
let socket
/** 连接调试端口；重启后复用同一套连接逻辑验证持久化。 */
const connect = async () => {
  let targets
  for (let i = 0; i < 80; i++) {
    try {
      targets = await (await fetch('http://127.0.0.1:9433/json')).json()
      if (targets.find((t) => t.type === 'page')) break
    } catch {}
    await delay(250)
  }
  const page = targets?.find((t) => t.type === 'page')
  if (!page) throw new Error('Electron did not start: ' + logs)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let sequence = 0
  const pendingCalls = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id) {
      const p = pendingCalls.get(msg.id)
      pendingCalls.delete(msg.id)
      msg.error ? p?.reject(new Error(msg.error.message)) : p?.resolve(msg.result)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pendingCalls.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { socket: ws, cdp: send }
}
try {
  const first = await connect()
  socket = first.socket
  const cdp = first.cdp
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const api = (expr) => evaluate(`(async()=>{${expr}})()`)
  await delay(500)
  assert.equal((await api('return await window.api.library.list()'))[0].chapters, 388)
  await fs.mkdir(path.join(root, 'import-previews'), { recursive: true })
  const id = '11111111-1111-1111-1111-111111111111'
  await fs.writeFile(
    path.join(root, 'import-previews', id + '.json'),
    JSON.stringify({
      title: '沟通练习',
      author: '测试作者',
      format: 'txt',
      hash: 'smoke-book',
      encoding: 'utf-8',
      warnings: [],
      chapters: [
        {
          title: '倾听与请求',
          path: '正文',
          content: '先倾听对方的需要。\n描述事实，再提出具体请求。',
          source: 'txt:0'
        }
      ]
    })
  )
  const bookId = await api(`return await window.api.library.confirm('${id}','沟通练习','测试作者')`)
  const book = (await api('return await window.api.library.list()')).find(
    (b) => b.bookId === bookId
  )
  const chapters = await api(`return await window.api.articles.list(${JSON.stringify(book)})`)
  let session = await api(
    `return await window.api.sessions.create('我想改善和同事沟通时总是产生误解的问题','reading','${bookId}')`
  )
  const sessionId = session.id,
    chapter = chapters[0]
  const cross = await api(
    `try{await window.api.reading.apply('${sessionId}',[{kind:'startReading',value:{articleId:'Section0215',reflections:[]}}],0);return false}catch{return true}`
  )
  assert.equal(cross, true)
  const settings = await api(
    `return await window.api.settings.set({apiKey:'smoke-secret',baseUrl:'http://127.0.0.1:${modelPort}/v1',model:'fake-model'})`
  )
  assert.equal(settings.apiKey, '')
  assert.equal(settings.hasApiKey, true)
  const diagnosis = await api(`return await window.api.ai.diagnose('${sessionId}')`)
  assert.equal(diagnosis.recommendations[0].articleId, chapter.id)
  const apply = async (commands, label, step) => {
    session = await api(
      `return await window.api.reading.apply('${sessionId}',${JSON.stringify(commands)},${session.stateVersion},${JSON.stringify(label)},${JSON.stringify(step)})`
    )
  }
  await apply([{ kind: 'diagnosis', value: diagnosis }], '诊断', 'focus')
  const passages = await api(
    `return await window.api.ai.findPassages('${sessionId}','${chapter.id}')`
  )
  assert.equal(passages.passages[0].verified, true)
  const reading = {
    articleId: chapter.id,
    title: chapter.title,
    startedAt: new Date().toISOString(),
    focusQuestion: passages.focusQuestion,
    passages: passages.passages,
    reflections: [
      {
        id: 'refl',
        paragraphIndex: 0,
        quote: '先倾听对方的需要。',
        text: '我经常还没听完就反驳。',
        createdAt: new Date().toISOString()
      }
    ],
    readDone: true,
    notes: {
      coreMethod: '先倾听需要再提请求',
      relatedProblem: '我没听完就反驳同事',
      action: '明天开会先复述同事需要再提请求'
    },
    feedback: null,
    notesDone: false
  }
  await apply([{ kind: 'startReading', value: reading }], '精读', 'relate')
  assert.equal(session.data.readings[0].reflections[0].source.chapterId, chapter.id)
  const feedback = await api(
    `return await window.api.ai.reviewNotes('${sessionId}','${chapter.id}',${JSON.stringify(reading.notes)})`
  )
  assert.equal(feedback.passed, true)
  await apply(
    [
      { kind: 'feedback', id: chapter.id, value: feedback },
      {
        kind: 'readingStatus',
        id: chapter.id,
        focusQuestion: reading.focusQuestion,
        readDone: true,
        notesDone: true
      },
      {
        kind: 'createAction',
        value: {
          id: 'action',
          text: reading.notes.action,
          fromArticleId: chapter.id,
          dueDate: '',
          status: 'done',
          result: '沟通更清楚了',
          progress: [],
          createdAt: new Date().toISOString()
        }
      }
    ],
    '笔记与行动',
    'apply'
  )
  const review = await api(
    `return await window.api.ai.reviewSituation('${sessionId}','我先听完再复述，同事解释了真正的困难')`
  )
  await apply([{ kind: 'review', value: review }], '复盘', 'apply')
  const stats = await api(`return await window.api.usage.query({sessionId:'${sessionId}'})`)
  assert.equal(stats.calls, 5)
  assert.equal(stats.total, 600)
  const task = await api(`return await window.api.library.index('${bookId}')`)
  let indexed
  for (let i = 0; i < 80; i++) {
    indexed = await api(`return await window.api.tasks.get('${task.id}')`)
    if (!['running', 'queued'].includes(indexed.status)) break
    await delay(50)
  }
  assert.equal(indexed.status, 'succeeded')
  const cachedCalls = (await api('return await window.api.usage.query()')).calls
  const second = await api(`return await window.api.library.index('${bookId}')`)
  for (let i = 0; i < 50; i++) {
    if ((await api(`return await window.api.tasks.get('${second.id}')`)).status === 'succeeded')
      break
    await delay(30)
  }
  assert.equal((await api('return await window.api.usage.query()')).calls, cachedCalls)
  // Exercise actual React command wiring, not just direct IPC APIs.
  const manual = await api(
    `return await window.api.sessions.create('我希望通过阅读练习更认真地听同事说话','reading','${bookId}')`
  )
  await evaluate(`location.hash='/session/${manual.id}'`)
  await delay(400)
  const clickText = async (text) => {
    const clicked = await evaluate(
      `(() => {const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`
    )
    assert.equal(clicked, true, `Missing button: ${text}`)
    await delay(350)
  }
  await clickText('自行选章')
  await clickText('倾听与请求')
  await clickText('我读完了')
  assert.match(await evaluate('document.body.innerText'), /和我有什么关系/)
  const notes = ['先听清原文中的需要与请求', '我常常急着反驳同事', '明天开会先复述同事的需要']
  for (let i = 0; i < notes.length; i++) {
    await evaluate(`document.querySelectorAll('.relate-form textarea')[${i}].focus()`)
    await cdp('Input.insertText', { text: notes[i] })
  }
  await clickText('保存笔记')
  const manualSaved = await api(`return await window.api.sessions.get('${manual.id}')`)
  assert.equal(manualSaved.data.actions[0].text, notes[2])
  assert.equal(manualSaved.currentStep, 'apply')
  await evaluate(`location.hash='/library'`)
  await delay(600)
  assert.equal(await evaluate("document.querySelectorAll('.lib-vol-head').length"), 7)
  assert.equal(
    await evaluate("document.querySelectorAll('.lib-vol-head[aria-expanded=true]').length"),
    1
  )
  assert.equal(await evaluate("document.querySelectorAll('.book-core-section button').length"), 5)
  await clickText('全部收起')
  assert.equal(
    await evaluate("document.querySelectorAll('.book-toc-root .lib-toc-item').length"),
    0
  )
  await clickText('全部展开')
  assert.equal(
    await evaluate("document.querySelectorAll('.book-toc-root .lib-toc-item').length"),
    388
  )
  await clickText('全部收起')
  await evaluate("document.querySelector('.lib-vol-head').click()")
  await cdp('Page.enable')
  await fs.mkdir('output/qa', { recursive: true })
  const tocShot = await cdp('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  await fs.writeFile('output/qa/library-toc.png', Buffer.from(tocShot.data, 'base64'))
  await evaluate("document.querySelector('.book-toc-root .lib-toc-item').click()")
  await delay(350)
  assert.match(await evaluate('document.body.innerText'), /中国社会各阶级的分析/)
  await evaluate("location.hash='/library'")
  await delay(500)
  await evaluate('document.querySelector(\'input[placeholder="在本书标题与正文中搜索"]\').focus()')
  await cdp('Input.insertText', { text: '中国社会各阶级的分析' })
  await delay(600)
  assert.match(
    await evaluate(
      "[...document.querySelectorAll('.lib-hit')].find(el => el.querySelector('.lib-hit-title')?.textContent === '中国社会各阶级的分析')?.querySelector('.lib-hit-vol')?.textContent"
    ),
    /第一卷/
  )
  await evaluate(`document.querySelectorAll('.book-grid button')[1].click()`)
  await delay(250)
  const text = await evaluate('document.body.innerText')
  assert.match(text, /沟通练习/)
  assert.match(text, /我的书架/)
  await cdp('Page.enable')
  const shot = await cdp('Page.captureScreenshot', { format: 'png' })
  await fs.mkdir('output/qa', { recursive: true })
  await fs.writeFile('output/qa/multibook-library.png', Buffer.from(shot.data, 'base64'))
  await evaluate(`location.hash='/session/${sessionId}'`)
  await delay(600)
  const body = await evaluate('document.body.innerText')
  assert.match(body, /沟通练习/)
  assert.doesNotMatch(body, /核心五篇/)
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile('output/qa/multibook-reading.png', Buffer.from(screenshot.data, 'base64'))
  const versions = await api(`return await window.api.versions.list('${sessionId}')`)
  const restored = await api(
    `return await window.api.versions.restore('${versions.at(-1).id}',(await window.api.sessions.get('${sessionId}')).stateVersion)`
  )
  assert.equal(restored.data.book.bookId, bookId)
  await api(`await window.api.library.hide('${bookId}',true)`)
  assert.equal(
    (await api('return await window.api.library.list()')).some((b) => b.bookId === bookId),
    false
  )
  assert.equal(
    (await api(`return await window.api.articles.get('${chapter.id}',${JSON.stringify(book)})`))
      .title,
    chapter.title
  )
  // Exercise workbench's real React command queue, parallel suggestions and atomic confirmation.
  const project = await api(
    "return await window.api.sessions.create('三个月内验证一次团队协作试点的方法','workbench')"
  )
  const form = {
    ...project.data.workbench.form,
    blockers: ['缺少试点反馈', '', ''],
    knownFacts: '已完成一次试点'
  }
  await api(
    `return await window.api.wb.apply('${project.id}',[{kind:'form',value:${JSON.stringify(form)}}],${project.stateVersion})`
  )
  await evaluate(`location.hash='/session/${project.id}'`)
  await delay(500)
  await clickText('整理事实台账')
  let savedProject = await api(`return await window.api.sessions.get('${project.id}')`)
  assert.equal(savedProject.data.workbench.intake.facts[0].id, 'F1')
  assert.equal(savedProject.data.workbench.ledger.length, 1)
  await clickText('进入三路诊断')
  await clickText('一键三路诊断')
  savedProject = await api(`return await window.api.sessions.get('${project.id}')`)
  assert.ok(savedProject.data.workbench.diagnosis.contradiction)
  assert.ok(savedProject.data.workbench.diagnosis.routes)
  assert.ok(savedProject.data.workbench.diagnosis.objSubj)
  await clickText('进入综合决策')
  await clickText('生成综合决策')
  await clickText('确认决策')
  await clickText('生成 7 / 30 / 90 天候选策略')
  savedProject = await api(`return await window.api.sessions.get('${project.id}')`)
  assert.equal(savedProject.currentStep, 'wb_act')
  assert.equal(savedProject.data.workbench.decision.confirmed, true)
  assert.equal(savedProject.data.workbench.actions.length, 3)
  // 模型生成只产生候选：不进入工作清单，也没有执行状态或阶段记录。
  assert.ok(
    savedProject.data.workbench.actions.every(
      (a) => a.planningState === 'candidate' && a.status === 'todo' && a.progress.length === 0
    )
  )
  // 生成候选不写工作清单：稍等侧栏计数稳定后取基线。
  await delay(600)
  const sidebarPending = async () =>
    Number(
      (await evaluate("document.querySelector('.sb-actions-count')?.textContent?.trim() ?? '0'")) ||
        0
    )
  const pendingBaseline = await sidebarPending()
  const readProject = () => api(`return await window.api.sessions.get('${project.id}')`)
  const workbenchActions = async () => (await readProject()).data.workbench.actions
  const queuedActionsOf = async () =>
    (await workbenchActions()).filter((a) => a.planningState === 'queued')
  const waitFor = async (check, label, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const value = await check()
      if (value) return value
      await delay(125)
    }
    throw new Error('Timed out waiting for ' + label)
  }
  const laneExpr = (section, laneName) =>
    `[...document.querySelectorAll(${JSON.stringify(
      section + ' .wbx-lane'
    )})].find((l) => l.querySelector('.wbx-lane-name')?.textContent?.trim() === ${JSON.stringify(
      laneName
    )})`
  const clickInLane = async (section, laneName, text) => {
    const clicked = await evaluate(`(() => {
      const lane = ${laneExpr(section, laneName)}
      if (!lane) return false
      const btn = [...lane.querySelectorAll('button')].find((b) => b.innerText.includes(${JSON.stringify(
        text
      )}))
      if (!btn) return false
      btn.click()
      return true
    })()`)
    assert.equal(clicked, true, `Missing ${text} button in ${laneName}`)
    await delay(300)
  }
  const checkCandidate = async (laneName) => {
    const ok = await evaluate(`(() => {
      const lane = ${laneExpr('.wbx-actions', laneName)}
      const box = lane?.querySelector('.wbx-candidate input[type=checkbox]')
      if (!box) return false
      box.click()
      return true
    })()`)
    assert.equal(ok, true, 'Missing candidate checkbox in ' + laneName)
    await delay(200)
  }
  const candidateCards = '.wbx-actions .wbx-candidate'
  const openCandidateEditor = async (laneName) => {
    const ok = await evaluate(`(() => {
      const lane = ${laneExpr('.wbx-actions', laneName)}
      const btn = lane?.querySelector('.wbx-candidate button')
      if (!btn) return false
      btn.click()
      return true
    })()`)
    assert.equal(ok, true, 'Missing candidate edit button in ' + laneName)
    await delay(250)
  }
  const typeCandidateAction = async (text) => {
    const ok = await evaluate(`(() => {
      const t = document.querySelector('${candidateCards} textarea')
      if (!t) return false
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(
        text
      )})
      t.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    assert.equal(ok, true, 'Missing candidate draft textarea')
    await delay(200)
  }
  const enqueueButton = "document.querySelector('.wbx-actions .wbx-selectbar .btn-primary')"
  const selectbarText = async () =>
    (
      await evaluate("document.querySelector('.wbx-actions .wbx-selectbar')?.innerText ?? ''")
    ).replace(/\s+/g, ' ')
  const enqueueDisabled = () => evaluate(`${enqueueButton}.disabled`)
  const clickEnqueue = async () => {
    await evaluate(`(() => { const b = ${enqueueButton}; if (b) b.click(); return true })()`)
    await delay(300)
  }
  const formTextareas = () =>
    evaluate("document.querySelectorAll('.wbx-actions .wbx-form textarea').length")
  const pageErrors = () =>
    evaluate(
      "[...document.querySelectorAll('.sp-main .error-text')].map((e) => e.textContent).join('')"
    )

  // ---- P2-1 回归：勾选 → 编辑 → 修改未保存，批量加入不得静默推送旧文本 ----
  await checkCandidate('7 天动作')
  assert.equal(await enqueueDisabled(), false)
  await openCandidateEditor('7 天动作')
  await typeCandidateAction('只访谈1位同事（人工筛选后缩减）')
  assert.match(await selectbarText(), /请先保存或取消编辑/)
  assert.equal(await enqueueDisabled(), true, '编辑未保存时加入待办必须禁用')
  assert.equal((await queuedActionsOf()).length, 0, '编辑未保存时不能推送任何旧文本')

  // 编辑期间“选择本组”仍只改临时选择，不能因此重新放开加入。
  await clickInLane('.wbx-actions', '30 天动作', '选择本组')
  assert.match(await selectbarText(), /已选 2 条/)
  assert.equal(await enqueueDisabled(), true)
  // 未保存时不会出现“成功反馈 + 查看工作清单”的离开入口。
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.wbx-actions button')].some((b) => b.innerText.includes('查看工作清单'))"
    ),
    false,
    '编辑未保存时不应出现查看工作清单入口'
  )
  // 直接触发被禁用的按钮（模拟误触）也不会提交。
  await clickEnqueue()
  await delay(300)
  assert.equal((await queuedActionsOf()).length, 0)
  // 取消编辑：草稿丢弃，库里的行动文本保持原样；选择保留，加入恢复可用。
  await evaluate(
    "document.querySelector('.wbx-actions .wbx-candidate .wbx-form-actions .btn-ghost').click()"
  )
  await delay(250)
  assert.equal((await workbenchActions())[0].action, '访谈2位同事')
  assert.equal(await enqueueDisabled(), false)

  // 编辑中直接离开页面：草稿丢弃但不写库；回来没有旧文本被静默纳入。
  await openCandidateEditor('7 天动作')
  await typeCandidateAction('只访谈1位同事（人工筛选后缩减）')
  assert.equal(await enqueueDisabled(), true)
  await evaluate("location.hash='/actions'")
  await delay(500)
  await evaluate(`location.hash='/session/${project.id}'`)
  await delay(700)
  const afterLeave = await workbenchActions()
  assert.equal(afterLeave.filter((a) => a.planningState === 'queued').length, 0)
  assert.equal(afterLeave[0].action, '访谈2位同事')
  assert.equal(await formTextareas(), 0, '离开再回来不应残留编辑表单')
  assert.match(await selectbarText(), /已选 0 条/)

  // ---- 保存后加入使用新文本；跨周期一次选择 2 条 ----
  await openCandidateEditor('7 天动作')
  await typeCandidateAction('只访谈1位同事（人工筛选后缩减）')
  await evaluate(
    "document.querySelector('.wbx-actions .wbx-candidate .wbx-form-actions .btn-primary').click()"
  )
  await waitFor(
    async () => (await workbenchActions())[0].action === '只访谈1位同事（人工筛选后缩减）',
    'saved candidate edit'
  )
  assert.equal((await workbenchActions())[0].planningState, 'candidate')
  assert.equal(await formTextareas(), 0, '保存后编辑表单应关闭')

  await checkCandidate('7 天动作')
  await checkCandidate('30 天动作')
  assert.match(await selectbarText(), /已选 2 条/)
  assert.equal(await enqueueDisabled(), false)
  // 双击提交不重复：第二次命令对已纳入的行动是无变化。
  await evaluate(`(() => { const b = ${enqueueButton}; b.click(); b.click(); return true })()`)
  const queuedTwo = await waitFor(async () => {
    const q = await queuedActionsOf()
    return q.length === 2 ? q : null
  }, 'queued two actions')
  const queuedTexts = queuedTwo.map((a) => a.action)
  assert.ok(queuedTexts.includes('只访谈1位同事（人工筛选后缩减）'), queuedTexts.join('|'))
  assert.ok(queuedTexts.includes('访谈2位同事'), queuedTexts.join('|'))
  assert.ok(
    queuedTwo.every((a) => a.status === 'todo' && (a.progress ?? []).length === 0),
    '加入待办不能自动带上执行状态或阶段记录'
  )
  assert.match(
    await evaluate("document.querySelector('.wbx-actions .wbx-feedback')?.innerText ?? ''"),
    /已加入 2 条/
  )
  assert.equal(await evaluate("document.querySelectorAll('.wbx-queued .wbx-action').length"), 2)
  await waitFor(async () => (await sidebarPending()) === pendingBaseline + 2, 'sidebar count +2')
  // 工作清单里核对条目：同一行动只有一条，且显示保存后的文本。
  await evaluate("document.querySelector('.wbx-actions .wbx-feedback button').click()")
  await delay(700)
  assert.match(await evaluate('location.hash'), /#\/actions/)
  await clickText('Todo 清单')
  const listRows = () =>
    evaluate("[...document.querySelectorAll('.action-row')].map((el) => el.innerText)")
  const rows = await waitFor(async () => {
    const all = await listRows()
    return all.some((t) => t.includes('只访谈1位同事（人工筛选后缩减）')) ? all : null
  }, 'work list rows')
  const rowsWith = (needle) => rows.filter((t) => t.includes(needle)).length
  assert.equal(rowsWith('只访谈1位同事（人工筛选后缩减）'), 1, '保存后的新文本应出现在清单')
  assert.equal(rowsWith('访谈2位同事'), 1, '已加入待办的行动不能出现副本')
  assert.equal(await sidebarPending(), pendingBaseline + 2)

  // ---- 撤回（移回候选）后清单与侧栏计数下降 ----
  await evaluate(`location.hash='/session/${project.id}'`)
  await delay(700)
  await evaluate(
    `document.querySelector('[aria-label="移回候选：只访谈1位同事（人工筛选后缩减）"]').click()`
  )
  await waitFor(async () => {
    const q = await queuedActionsOf()
    return q.length === 1 && q[0].action === '访谈2位同事' ? q : null
  }, 'return to candidates')
  const returned = (await workbenchActions()).find(
    (a) => a.action === '只访谈1位同事（人工筛选后缩减）'
  )
  assert.equal(returned.planningState, 'candidate')
  await evaluate("location.hash='/actions'")
  await delay(700)
  await waitFor(async () => (await sidebarPending()) === pendingBaseline + 1, 'sidebar count +1')
  await clickText('Todo 清单')
  const afterReturnRows = await listRows()
  assert.equal(
    afterReturnRows.filter((t) => t.includes('只访谈1位同事（人工筛选后缩减）')).length,
    0,
    '移回候选的行动必须从清单消失'
  )
  assert.equal(afterReturnRows.filter((t) => t.includes('访谈2位同事')).length, 1)

  // ---- 窄窗口与键盘可达性：批量操作栏可见、不被遮挡，checkbox 可用空格切换 ----
  await evaluate(`location.hash='/session/${project.id}'`)
  await delay(700)
  // 窗口最小宽度是 1100（BrowserWindow.minWidth），窄窗验收按支持范围的最窄值测。
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false
  })
  await delay(300)
  await evaluate(
    "document.querySelector('.wbx-actions .wbx-selectbar').scrollIntoView({block:'end'})"
  )
  await delay(200)
  const narrowLayout = await evaluate(`(() => {
    const bar = document.querySelector('.wbx-actions .wbx-selectbar')
    if (!bar) return { bar: false }
    const r = bar.getBoundingClientRect()
    const btn = bar.querySelector('.btn-primary')
    const br = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2)
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      bar: { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width) },
      btn: { top: Math.round(br.top), bottom: Math.round(br.bottom), w: Math.round(br.width) },
      hit: hit === btn || btn.contains(hit)
    }
  })()`)
  assert.equal(
    narrowLayout.bar !== false &&
      narrowLayout.bar.w > 0 &&
      narrowLayout.bar.top >= 0 &&
      narrowLayout.bar.bottom <= narrowLayout.vh + 1 &&
      narrowLayout.btn.top >= 0 &&
      narrowLayout.btn.bottom <= narrowLayout.vh + 1 &&
      narrowLayout.hit,
    true,
    '窄窗口下批量操作栏应可见且不被遮挡：' + JSON.stringify(narrowLayout)
  )
  const checkboxAria = await evaluate(
    "document.querySelector('.wbx-actions .wbx-candidate input[type=checkbox]').getAttribute('aria-label')"
  )
  assert.match(String(checkboxAria), /选择候选策略/)
  await evaluate(
    "document.querySelector('.wbx-actions .wbx-candidate input[type=checkbox]').focus()"
  )
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32
  })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
    nativeVirtualKeyCode: 32
  })
  await delay(250)
  assert.equal(
    await evaluate(
      "document.querySelector('.wbx-actions .wbx-candidate input[type=checkbox]').checked"
    ),
    true,
    '空格应能切换候选勾选'
  )
  await cdp('Emulation.clearDeviceMetricsOverride')
  await evaluate("document.querySelector('.wbx-actions .wbx-selectbar .btn-ghost')?.click()")
  await delay(200)
  assert.equal(await pageErrors(), '')
  savedProject = await readProject()

  // The specialized profile still generates and accepts a diagnosis against builtin sources.
  const mao = await api(
    "return await window.api.sessions.create('我想解决工作中同时推进太多事情导致没有重点的问题')"
  )
  await api(
    `const d=await window.api.ai.diagnose('${mao.id}'); return await window.api.reading.apply('${mao.id}',[{kind:'diagnosis',value:d}],0,'毛选诊断','focus')`
  )
  // ---- 重启持久化：同一 userData 再启动一次，纳入状态与整理结果仍在 ----
  const beforeRestart = await readProject()
  const queuedBeforeRestart = beforeRestart.data.workbench.actions.filter(
    (a) => a.planningState === 'queued'
  )
  socket.close()
  app.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000)
    app.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  app = launchApp()
  collectLogs(app)
  const reconnect = await connect()
  socket = reconnect.socket
  const evaluateAfter = async (expression) => {
    const r = await reconnect.cdp('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const apiAfter = (expr) => evaluateAfter(`(async()=>{${expr}})()`)
  await delay(900)
  const afterRestart = await apiAfter(`return await window.api.sessions.get('${project.id}')`)
  const queuedAfterRestart = afterRestart.data.workbench.actions.filter(
    (a) => a.planningState === 'queued'
  )
  assert.equal(queuedAfterRestart.length, queuedBeforeRestart.length)
  assert.equal(queuedAfterRestart.length, 1)
  assert.equal(queuedAfterRestart[0].action, '访谈2位同事')
  assert.equal(
    afterRestart.data.workbench.actions.filter((a) => a.planningState === 'candidate').length,
    2
  )
  // 重启后页面靠持久化数据渲染，不是内存里的旧状态。
  await evaluateAfter(`location.hash='/session/${project.id}'`)
  let sidebarAfterRestart = null
  for (let i = 0; i < 40; i++) {
    await delay(150)
    sidebarAfterRestart = await evaluateAfter(
      "document.querySelector('.sb-actions-count')?.textContent?.trim()"
    )
    if (sidebarAfterRestart === String(pendingBaseline + 1)) break
  }
  const restartedBody = await evaluateAfter('document.body.innerText')
  assert.match(restartedBody, /访谈2位同事/)
  assert.match(restartedBody, /只访谈1位同事（人工筛选后缩减）/)
  assert.equal(sidebarAfterRestart, String(pendingBaseline + 1))

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          '388 builtin chapters',
          'import confirm',
          'book-scoped session',
          'cross-book rejection',
          'redacted secret',
          'evidence-backed recommendation',
          'passage verification',
          'reflection SourceRef',
          'notes feedback',
          'action and review',
          'exact provider usage',
          'index resumability/cache',
          'real rendered library and reading UI',
          'seven original volumes, core shortcuts, collapse/expand, chapter navigation and search location',
          'manual four-step React command wiring',
          'history restore',
          'hidden book source retention',
          'workbench React four steps and parallel analysis',
          'workbench generated actions stay candidates',
          'workbench unsaved candidate edit blocks batch enqueue and does not push stale text',
          'workbench cancel/leave discards draft without writing the database',
          'workbench cross-cycle selection enqueues exactly 2 with saved text, no duplicates on double submit',
          'workbench work list entries, no task copies and sidebar count match',
          'workbench returning to candidates removes the task and lowers the sidebar count',
          'workbench narrow-window selection bar visible/unoccluded and keyboard checkbox toggle',
          'workbench queued state survives app restart and renders from persisted data',
          'maoxuan profile diagnosis compatibility'
        ],
        testData: root
      },
      null,
      2
    )
  )
} catch (e) {
  console.error(e)
  console.error(logs.slice(-2500))
  process.exitCode = 1
} finally {
  socket?.close()
  app.kill('SIGTERM')
  await new Promise((r) => server.close(r))
}
