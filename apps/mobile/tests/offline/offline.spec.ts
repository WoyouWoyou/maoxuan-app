import { test, expect } from '@playwright/test'
test('production app keeps desktop Markdown editing and reading available after offline reload', async ({
  page,
  context
}) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
  await page.evaluate(async () => {
    const n = await window.api.journal.apply({ kind: 'noteCreate', folderId: null })
    await window.api.journal.apply({
      kind: 'noteSave',
      id: n.selectedId!,
      revision: 0,
      title: '离线记录',
      markdown: '# 离线调查\n\n**先看实际**\n',
      tags: []
    })
  })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true
        })
      )
  })
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: '记录', exact: true }).click()
  await page.getByRole('button', { name: '打开文件夹', exact: true }).click()
  await page
    .getByRole('button', { name: /离线记录/ })
    .first()
    .click()
  await expect(page.locator('.vditor-ir h1')).toContainText('离线调查')
  await expect(page.locator('.vditor-ir strong')).toContainText('先看实际')
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await page.getByRole('button', { name: /我的书架/ }).click()
  await page.getByLabel('搜索篇名或正文').fill('实践论')
  await page
    .locator('.article-row')
    .filter({ has: page.getByRole('heading', { name: '实践论', exact: true }) })
    .click()
  await expect(page.locator('.m-reader-content h1')).toHaveText('实践论')
})
