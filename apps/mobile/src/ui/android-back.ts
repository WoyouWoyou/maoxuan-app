/** Dismiss temporary UI before applying hierarchical navigation. */
export function dismissBackLayer(doc: Document): boolean {
  const dialogs = [...doc.querySelectorAll<HTMLDialogElement>('dialog[open]')]
  const dialog = dialogs.at(-1)
  if (dialog) {
    const cancel = new Event('cancel', { cancelable: true })
    if (dialog.dispatchEvent(cancel)) dialog.close()
    return true
  }
  const popover = doc.querySelector<HTMLElement>('[popover]:popover-open')
  if (popover) {
    popover.hidePopover()
    return true
  }
  const overlay = [...doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
    .filter((el) => el.getClientRects().length)
    .at(-1)
  if (overlay) {
    const close =
      overlay.querySelector<HTMLButtonElement>('[aria-label^="关闭"]') ??
      [...overlay.querySelectorAll('button')].find((b) =>
        /^(取消|关闭|返回)$/.test(b.textContent?.trim() ?? '')
      )
    if (close) {
      close.click()
      return true
    }
  }
  const dismiss = doc.querySelector<HTMLButtonElement>(
    '.focus-coach-dismiss, [aria-label="关闭文件夹"]'
  )
  if (dismiss?.getClientRects().length) {
    dismiss.click()
    return true
  }
  const more = doc.querySelector<HTMLDetailsElement>('.focus-session-header details[open]')
  if (more) {
    more.open = false
    return true
  }
  return false
}
export function backDestination(path: string, tab: string): { path: string; tab?: string } | null {
  if (path.startsWith('/session/')) return { path: '/', tab: 'practice' }
  if (/^\/long-march\/[^/]+\/scenery$/.test(path)) return { path: path.replace(/\/scenery$/, '') }
  if (path.startsWith('/long-march/')) return { path: '/long-march' }
  if (path !== '/' || tab !== 'home') return { path: '/', tab: 'home' }
  return null
}
