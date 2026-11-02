import { test, expect } from '@playwright/test'
async function createReading(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '新建阅读问题', exact: true }).click()
  await page.getByPlaceholder('例如：和同事沟通不畅').fill('改善团队沟通')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await page.locator('.step-problem textarea').first().fill('我应该如何减少团队中的重复沟通')
}
test('navigation follows the five requested entries, and the library lives on home', async ({
  page
}) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '主导航' })
  await expect(nav.getByRole('button')).toHaveText(['首页', '实践', '待办', '记录', '我的'])
  await expect(nav.getByRole('button', { name: '书架' })).toHaveCount(0)
  await page.getByRole('button', { name: /我的书架/ }).click()
  await expect(page.getByRole('heading', { name: '书架', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await page.screenshot({ path: 'test-results/home-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('desktop reading flow preserves gates, three notes, confirmation and action projection', async ({
  page
}) => {
  await page.goto('/')
  await createReading(page)
  await page.getByRole('button', { name: '自行选章，直接阅读 →' }).click()
  await expect(page.locator('.step-focus')).toBeVisible()
  await page.getByRole('button', { name: '我读完了，去写 3 条笔记' }).click()
  const notes = page.locator('.relate-form textarea')
  await expect(notes).toHaveCount(3)
  await notes.nth(0).fill('认识必须从调查实际情况开始')
  await notes.nth(1).fill('我还没有了解同事为何重复询问')
  await notes.nth(2).fill('访谈三位同事并整理共同的问题')
  await page.getByRole('button', { name: '保存笔记后进入行动' }).click()
  await expect(page.locator('.step-apply')).toBeVisible()
  await expect(page.locator('.step-apply')).toContainText('访谈三位同事并整理共同的问题')
  await page.getByRole('button', { name: '我的问题', exact: true }).click()
  await page.getByRole('button', { name: '待办', exact: true }).click()
  await expect(page.getByRole('heading', { name: '四象限工作法', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Todo 清单' }).click()
  await expect(
    page.getByRole('button', { name: '查看任务：访谈三位同事并整理共同的问题' })
  ).toBeVisible()
})
test('real desktop four-quadrant page creates, edits, progresses and completes independent tasks', async ({
  page
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '待办', exact: true }).click()
  await page.getByRole('button', { name: '添加任务', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加行动任务' })
  await dialog.getByLabel('任务名称', { exact: true }).fill('整理调查记录')
  await dialog.getByRole('combobox').nth(1).selectOption('plan')
  await dialog.getByRole('button', { name: '添加任务', exact: true }).click()
  await expect(page.getByRole('region', { name: '计划安排' })).toContainText('整理调查记录')
  await page.getByLabel('新增进展').fill('已整理第一批访谈')
  await page.getByRole('button', { name: '记录进展', exact: true }).click()
  await expect(page.locator('.action-detail')).toContainText('已整理第一批访谈')
  await page.getByRole('button', { name: '关闭行动详情' }).click()
  await page.getByRole('checkbox', { name: '完成任务：整理调查记录' }).click()
  await page.getByRole('tab', { name: 'Todo 清单' }).click()
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看任务：整理调查记录' })).toBeVisible()
  await page.screenshot({ path: 'test-results/todo-mobile.png' })
})
test('desktop Vditor renders Markdown, edits, saves, reloads and exports actual md', async ({
  page
}) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.evaluate(async () => {
    const n = await window.api.journal.apply({ kind: 'noteCreate', folderId: null })
    await window.api.journal.apply({
      kind: 'noteSave',
      id: n.selectedId!,
      revision: 0,
      title: '调查笔记',
      markdown: '# 调查\n\n**先看事实**\n\n- [ ] 访谈三位同事\n',
      tags: ['实践']
    })
  })
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await page.getByRole('button', { name: '打开文件夹', exact: true }).click()
  await page
    .getByRole('button', { name: /调查笔记/ })
    .first()
    .click()
  await expect(page.locator('.vditor-ir h1')).toContainText('调查')
  await expect(page.locator('.vditor-ir strong')).toContainText('先看事实')
  const editor = page.locator('.vditor-ir pre[contenteditable=true]')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('补充了两条一线反馈')
  await expect
    .poll(() => page.evaluate(async () => (await window.api.journal.list()).notes[0].markdown))
    .toContain('补充了两条一线反馈')
  await page.screenshot({ path: 'test-results/markdown-mobile.png' })
  await page.reload()
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await expect(page.locator('.vditor-ir')).toContainText('补充了两条一线反馈')
  const downloadPromise = page.waitForEvent('download')
  await page.evaluate(async () => {
    const note = (await window.api.journal.list()).notes[0]
    await window.api.journal.export(null, note.id)
  })
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('调查笔记.md')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('coach diagnosis uses the desktop prompt and confirmation gate', async ({ page }) => {
  await page.route('https://mock.example/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.messages[0].content).toContain('主要矛盾')
    await route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                restated: '团队缺少统一的信息记录',
                symptoms: ['反复回答同一个问题'],
                mainContradiction: '记录缺失',
                stage: '调查阶段',
                recommendations: []
              })
            }
          }
        ]
      }
    })
  })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.evaluate(() =>
    window.api.settings.set({
      apiKey: 'test-key',
      baseUrl: 'https://mock.example/v1',
      model: 'mock'
    })
  )
  await createReading(page)
  await page.getByRole('button', { name: '请教练诊断', exact: true }).click()
  await expect(page.locator('.problem-diagnosis')).toContainText('记录缺失')
  await expect(page.getByRole('button', { name: '确认问题，进入第二步 →' })).toBeEnabled()
  await page.getByRole('button', { name: '确认问题，进入第二步 →' }).click()
  await expect(page.locator('.step-focus')).toBeVisible()
})
test('workbench keeps the desktop method picker and runs only the selected analysis', async ({
  page
}) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.route('https://mock.example/v1/chat/completions', (route) =>
    route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                factRefs: ['F1'],
                missingFacts: [],
                routes: [
                  {
                    key: 'steady',
                    judgment: '先验证一个试点',
                    policy: '小范围调查',
                    result: '获得真实反馈',
                    triggers: [],
                    risks: [],
                    switchSignals: []
                  },
                  {
                    key: 'breakthrough',
                    judgment: '扩大样本',
                    policy: '增加访谈',
                    result: '补充证据',
                    triggers: [],
                    risks: [],
                    switchSignals: []
                  },
                  {
                    key: 'defensive',
                    judgment: '保留资源',
                    policy: '延后扩展',
                    result: '减少投入',
                    triggers: [],
                    risks: [],
                    switchSignals: []
                  }
                ]
              })
            }
          }
        ]
      }
    })
  )
  const id = await page.evaluate(async () => {
    let s = await window.api.sessions.create('客户调研方案', 'workbench')
    const form = {
      ...s.data.workbench!.form,
      objective: '验证客户需求的真实变化',
      blockers: ['缺少一线反馈', '', '']
    }
    s = await window.api.wb.apply(
      s.id,
      [
        { kind: 'form', value: form },
        {
          kind: 'intake',
          value: {
            facts: [
              { id: 'F1', kind: 'fact', content: '已经收到三份反馈', confidence: 'confirmed' }
            ],
            missing: [],
            questions: [],
            mainline: form.objective,
            sideGoals: [],
            generatedAt: new Date().toISOString()
          }
        }
      ],
      s.stateVersion,
      '整理事实',
      'wb_diagnose'
    )
    return s.id
  })
  await page.goto(`/#/session/${id}`)
  await expect(page.getByLabel(/三条路线 · 选择难定/)).toBeVisible()
  await page.getByLabel(/三条路线 · 选择难定/).check()
  await page.getByRole('button', { name: '确认方法', exact: true }).click()
  await page.evaluate(() =>
    window.api.settings.set({ apiKey: 'test', baseUrl: 'https://mock.example/v1', model: 'mock' })
  )
  await page.getByRole('button', { name: '开始所选诊断', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await window.api.sessions.get(id))?.data.workbench?.diagnosis.routes?.routes.length,
        id
      )
    )
    .toBe(3)
  const modules = await page.evaluate(
    async (id) => (await window.api.sessions.get(id))!.data.workbench!.diagnosis,
    id
  )
  expect(modules.contradiction).toBe(null)
  expect(modules.objSubj).toBe(null)
  await page.screenshot({ path: 'test-results/workbench-mobile.png', fullPage: true })
})

test('mobile reading hides permanent panels, remembers the chapter preference, and keeps reflection drafts when closed', async ({
  page
}) => {
  await page.goto('/')
  await createReading(page)
  await page.getByRole('button', { name: '自行选章，直接阅读 →' }).click()
  await expect(page.locator('.mobile-focus-session')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '篇目与推荐', exact: true })).not.toBeVisible()
  await expect(page.getByPlaceholder('这段让我想到……')).not.toBeVisible()
  await expect(page.getByRole('button', { name: '记感悟', exact: true })).toBeVisible()
  const content = await page.locator('.step-focus-reader').boundingBox()
  expect(content!.width).toBeGreaterThan(330)
  await page.getByRole('button', { name: '篇目', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '篇目与推荐', exact: true })
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('默认收起篇目栏').uncheck()
  await expect
    .poll(() =>
      page.evaluate(async () => (await window.api.settings.getReader()).mobileTocCollapsed)
    )
    .toBe(false)
  await page.getByRole('button', { name: '关闭篇目与推荐', exact: true }).click()
  await page.reload()
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('默认收起篇目栏').check()
  await page.getByRole('button', { name: '关闭篇目与推荐', exact: true }).click()
  await page.getByRole('button', { name: '记感悟', exact: true }).click()
  const field = page.getByPlaceholder('这段让我想到……')
  await field.fill('先调查一次真实的工作环节')
  await page.getByRole('button', { name: '关闭阅读感悟', exact: true }).click()
  await page.getByRole('button', { name: '记感悟', exact: true }).click()
  await expect(field).toHaveValue('先调查一次真实的工作环节')
  await page.getByRole('button', { name: '记下', exact: true }).click()
  await expect(field).toHaveValue('')
  await page.getByRole('button', { name: '关闭阅读感悟', exact: true }).click()
  await page.reload()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.reader-text').first()).toBeVisible()
  await page.getByRole('button', { name: '阅读选项', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '阅读选项', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭阅读选项', exact: true }).click()
  await page.screenshot({ path: 'test-results/reading-mobile.png' })
})

test('home has a fixed achievements entrance backed by real progress, and native sync is explicit',async({page})=>{
 await page.goto('/')
 await page.getByRole('button',{name:/我的成就/}).click()
 await expect(page.getByRole('heading',{name:'长征不怕远征难'})).toBeVisible()
 await expect(page.locator('.march-page')).toContainText('成长值')
 await page.getByRole('button',{name:'返回首页',exact:true}).click()
 await page.getByRole('button',{name:'我的',exact:true}).click()
 const sync=page.getByRole('region',{name:'设备同步'})
 await expect(sync).toBeVisible()
 await sync.getByPlaceholder('粘贴电脑「设置 → 设备同步」中的配对码').fill('{}')
 await sync.getByRole('button',{name:'立即同步',exact:true}).click()
 await expect(sync.getByRole('alert')).toContainText('Android APK')
})
