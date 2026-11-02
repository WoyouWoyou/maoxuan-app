import { Capacitor } from '@capacitor/core'
import { zipSync, strToU8 } from 'fflate'
export function chooseMarkdown(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.md,.markdown,text/markdown'
    input.onchange = () => resolve([...(input.files ?? [])])
    input.oncancel = () => resolve([])
    input.click()
  })
}
export async function exportMarkdown(notes: { id: string; title: string; markdown: string }[]) {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || '未命名'
  const name = notes.length === 1 ? `${safe(notes[0].title)}.md` : '毛选记录.zip'
  const bytes =
    notes.length === 1
      ? strToU8(notes[0].markdown)
      : zipSync(
          Object.fromEntries(
            notes.map((n) => [`${safe(n.title)}-${n.id.slice(0, 8)}.md`, strToU8(n.markdown)])
          )
        )
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    let binary = ''
    bytes.forEach((b) => (binary += String.fromCharCode(b)))
    const file = await Filesystem.writeFile({
      path: name,
      data: btoa(binary),
      directory: Directory.Cache
    })
    await Share.share({ title: '导出 Markdown', url: file.uri })
  } else {
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], {
        type: notes.length === 1 ? 'text/markdown' : 'application/zip'
      })
    )
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
