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
const app = spawn(require('electron'), ['.', '--remote-debugging-port=9433'], {
  env: { ...process.env, MAOXUAN_USER_DATA: root, MAOXUAN_TEST: '1', ELECTRON_RENDERER_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe']
})
let logs = ''
app.stderr.on('data', (b) => {
  logs += b
})
app.stdout.on('data', (b) => {
  logs += b
})
let socket
try {
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
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    socket.onopen = r
    socket.onerror = j
  })
  let sequence = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p?.reject(new Error(msg.error.message)) : p?.resolve(msg.result)
    }
  }
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
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
  await clickText('选择本组')
  await clickText('加入待办')
  let queuedActions = []
  for (let i = 0; i < 20; i++) {
    const current = await api(`return await window.api.sessions.get('${project.id}')`)
    queuedActions = current.data.workbench.actions.filter((a) => a.planningState === 'queued')
    if (queuedActions.length > 0) break
    await delay(250)
  }
  assert.equal(queuedActions.length, 1)
  assert.ok(queuedActions.every((a) => a.status === 'todo' && a.progress.length === 0))
  savedProject = await api(`return await window.api.sessions.get('${project.id}')`)
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.sp-main .error-text')].map(e=>e.textContent).join('')"
    ),
    ''
  )
  // The specialized profile still generates and accepts a diagnosis against builtin sources.
  const mao = await api(
    "return await window.api.sessions.create('我想解决工作中同时推进太多事情导致没有重点的问题')"
  )
  await api(
    `const d=await window.api.ai.diagnose('${mao.id}'); return await window.api.reading.apply('${mao.id}',[{kind:'diagnosis',value:d}],0,'毛选诊断','focus')`
  )
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
          'workbench candidate selection and batch enqueue',
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
