import { JOURNAL_TEMPLATES } from '@shared/journal-templates'
const randomUUID = () => globalThis.crypto.randomUUID()
import {
  journalDescendants,
  journalFolderHidden,
  type JournalAttachment,
  type JournalCommand,
  type JournalNote,
  type JournalResult,
  type JournalState
} from '@shared/journal'
export interface JournalRepository {
  read(): JournalState
  write(state: JournalState): void
  transaction<T>(work: () => T): T
}
export interface JournalAssets {
  put(id: string, data: Uint8Array): void
  get(id: string): Uint8Array
  remove(id: string): void
}
export function createJournalService(
  repo: JournalRepository,
  assets: JournalAssets,
  reward: (id: string, date: string) => void | boolean
) {
  const folder = (s: JournalState, id: string) => {
    const f = s.folders.find((f) => f.id === id)
    if (!f) throw new Error('文件夹不存在')
    return f
  }
  const writable = (s: JournalState, id: string | null) => {
    if (id) folder(s, id)
    if (journalFolderHidden(s, id, 'archived') || journalFolderHidden(s, id, 'deleted'))
      throw new Error('请先恢复文件夹，再编辑记录')
  }
  const note = (s: JournalState, id: string) => {
    const n = s.notes.find((n) => n.id === id)
    if (!n) throw new Error('记录不存在')
    return n
  }
  const editable = (s: JournalState, id: string) => {
    const n = note(s, id)
    writable(s, n.folderId)
    if (n.deleted) throw new Error('请先恢复记录')
    return n
  }
  const nameOk = (s: JournalState, name: string, parentId: string | null, id?: string) => {
    if (!name.trim() || name.length > 100 || /[\\/\u0000-\u001f]/.test(name))
      throw new Error('文件夹名称不能为空或包含路径字符，最多100字')
    if (
      s.folders.some(
        (f) => f.id !== id && !f.deleted && f.parentId === parentId && f.name === name.trim()
      )
    )
      throw new Error('同一目录已存在同名文件夹')
  }
  const createNote = (folderId: string | null): JournalNote => {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      folderId,
      title: '',
      markdown: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      deleted: false,
      source: 'local',
      revision: 0,
      attachments: []
    }
  }
  const completionError = (n: JournalNote): string | undefined => {
    if (
      !n.markdown
        .replace(/!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/[\s#>*_`~\-\[\]()!|=+]/g, '') &&
      !n.attachments.some((a) => a.mime.startsWith('audio/') && assets.get(a.id).length > 64)
    )
      return '写下一点文字，或保存一段录音后再完成记录'
    if (
      n.templateMarkdown &&
      n.markdown.replace(/[\s#>*_`~\-\[\]()!|=+\\]/g, '') ===
        n.templateMarkdown.replace(/[\s#>*_`~\-\[\]()!|=+\\]/g, '') &&
      !n.attachments.some((a) => a.mime.startsWith('audio/'))
    )
      return '请先填写模板内容或保存录音，再完成记录'
  }
  const complete = (n: JournalNote): boolean => {
    if (n.completedAt) return false
    n.completedAt = new Date().toISOString()
    n.revision++
    return n.source === 'local' && reward(n.id, n.completedAt) !== false
  }
  function apply(command: JournalCommand): JournalResult {
    const before = repo.read().notes.flatMap((n) => n.attachments.map((a) => a.id))
    const result = repo.transaction(() => {
      const s = repo.read()
      let selectedId: string | undefined
      let earned = false
      switch (command.kind) {
        case 'folderCreate':
          writable(s, command.parentId)
          nameOk(s, command.name, command.parentId)
          s.folders.push({
            id: randomUUID(),
            parentId: command.parentId,
            name: command.name.trim(),
            archived: false,
            deleted: false
          })
          break
        case 'folderEdit': {
          const f = folder(s, command.id)
          writable(s, f.id)
          writable(s, command.parentId)
          if (command.parentId && journalDescendants(s, f.id).has(command.parentId))
            throw new Error('不能移动到自己或子文件夹')
          nameOk(s, command.name, command.parentId, f.id)
          f.name = command.name.trim()
          f.parentId = command.parentId
          break
        }
        case 'folderArchive':
        case 'folderDelete': {
          const f = folder(s, command.id)
          if (!command.value) {
            writable(s, f.parentId)
            nameOk(s, f.name, f.parentId, f.id)
          }
          if (command.kind === 'folderArchive') f.archived = command.value
          else f.deleted = command.value
          break
        }
        case 'templateSave': {
          const n = note(s, command.noteId)
          if (!command.name.trim() || command.name.length > 100 || !n.markdown.trim())
            throw new Error('请填写模板名称和正文（名称最多100字）')
          if (n.attachments.length)
            throw new Error('模板仅保存Markdown正文，请使用不含本地附件的笔记')
          s.templates ??= []
          s.templates.push({
            id: randomUUID(),
            name: command.name.trim(),
            category: '我的模板',
            markdown: n.markdown
          })
          break
        }
        case 'templateDelete':
          s.templates = (s.templates ?? []).filter((t) => t.id !== command.id)
          break
        case 'noteCreate': {
          writable(s, command.folderId)
          const n = createNote(command.folderId)
          if (command.templateId) {
            const template = [...JOURNAL_TEMPLATES, ...(s.templates ?? [])].find(
              (t) => t.id === command.templateId
            )
            if (!template) throw new Error('模板不存在，请重新选择')
            n.title = `${template.name} · ${new Date().toLocaleDateString('zh-CN')}`
            n.markdown = template.markdown
            n.templateMarkdown = template.markdown
          }
          s.notes.push(n)
          selectedId = n.id
          break
        }
        case 'noteSave': {
          const n = editable(s, command.id)
          if (n.revision !== command.revision)
            throw new Error('记录已在其他窗口修改，请复制当前内容后重新载入')
          n.title = command.title
          n.markdown = command.markdown
          n.tags = command.tags
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 30)
          n.revision++
          n.updatedAt = new Date().toISOString()
          if (!completionError(n)) earned = complete(n)
          break
        }
        case 'noteMove':
          writable(s, command.folderId)
          for (const id of command.ids) {
            const n = editable(s, id)
            n.folderId = command.folderId
            n.revision++
          }
          break
        case 'noteComplete': {
          const n = editable(s, command.id)
          const error = completionError(n)
          if (error) throw new Error(error)
          earned = complete(n)
          break
        }
        case 'noteDelete': {
          const n = note(s, command.id)
          writable(s, n.folderId)
          n.deleted = command.value
          n.revision++
          break
        }
        case 'notePurge': {
          const n = note(s, command.id)
          if (!n.deleted && !journalFolderHidden(s, n.folderId, 'deleted'))
            throw new Error('只能永久删除回收站记录')
          s.notes = s.notes.filter((x) => x.id !== n.id)
          break
        }
        case 'attachmentRemove': {
          const n = editable(s, command.id)
          n.attachments = n.attachments.filter((a) => a.id !== command.attachmentId)
          n.revision++
          break
        }
      }
      repo.write(s)
      return { state: s, selectedId, earned }
    })
    const referenced = new Set(result.state.notes.flatMap((n) => n.attachments.map((a) => a.id)))
    for (const id of before)
      if (!referenced.has(id)) {
        try {
          assets.remove(id)
        } catch {
          /* Metadata committed; orphan can be cleaned later. */
        }
      }
    return result
  }
  function attach(id: string, name: string, mime: string, bytes: Uint8Array): JournalAttachment {
    if (
      !/^(audio\/(webm|ogg|mp4|mpeg|wav)|image\/(png|jpeg|webp|gif))$/.test(mime) ||
      bytes.length < 16 ||
      bytes.length > 100 * 1024 * 1024
    )
      throw new Error('附件格式或大小不支持（上限100MB）')
    const head = Array.from(bytes.slice(0, 4))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
    const valid = mime.includes('webm')
      ? head === '1a45dfa3'
      : mime.includes('ogg')
        ? head === '4f676753'
        : mime.includes('png')
          ? head === '89504e47'
          : mime.includes('jpeg')
            ? head.startsWith('ffd8')
            : mime.includes('gif')
              ? head === '47494638'
              : mime.includes('mp4')
                ? new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp'
                : mime.includes('wav') || mime.includes('webp')
                  ? head === '52494646'
                  : mime.includes('mpeg')
                    ? head.startsWith('494433') || (bytes[0] === 255 && (bytes[1] & 224) === 224)
                    : false
    if (!valid || (mime.startsWith('audio/') && bytes.length <= 64))
      throw new Error('附件内容与格式不匹配')
    const a = { id: randomUUID(), name: name.slice(0, 150), mime, size: bytes.length }
    assets.put(a.id, bytes)
    try {
      repo.transaction(() => {
        const s = repo.read()
        const n = editable(s, id)
        n.attachments.push(a)
        n.revision++
        repo.write(s)
      })
    } catch (e) {
      assets.remove(a.id)
      throw e
    }
    return a
  }
  return {
    read: () => repo.read(),
    apply,
    attach,
    media: (id: string) => {
      const s = repo.read()
      const a = s.notes.flatMap((n) => n.attachments).find((a) => a.id === id)
      if (!a) throw new Error('附件不存在')
      return { ...a, bytes: assets.get(id) }
    },
    importRecords: (
      input: JournalState,
      files: Record<string, Uint8Array>,
      target: string | null
    ) =>
      repo.transaction(() => {
        const s = repo.read()
        writable(s, target)
        s.templates ??= []
        for (const template of input.templates ?? []) {
          if (!s.templates.some((t) => t.id === template.id))
            s.templates.push({ ...template, category: '我的模板' })
        }
        const map = new Map<string, string>()
        let count = 0
        const pending = [...input.folders]
        while (pending.length) {
          const index = pending.findIndex((f) => !f.parentId || map.has(f.parentId))
          if (index < 0) throw new Error('备份文件夹层级无效')
          const f = pending.splice(index, 1)[0]
          const parentId = f.parentId ? map.get(f.parentId)! : target
          const existing = s.folders.find((x) => x.id === `import:${f.id}` || x.id === f.id)
          if (existing) {
            map.set(f.id, existing.id)
            continue
          }
          let name = f.name
          let suffix = 1
          while (s.folders.some((x) => x.parentId === parentId && x.name === name && !x.deleted))
            name = `${f.name}（导入${suffix++}）`
          nameOk(s, name, parentId)
          const id = `import:${f.id}`
          map.set(f.id, id)
          s.folders.push({ id, parentId, name, archived: !!f.archived, deleted: false })
        }
        for (const source of input.notes) {
          // Stable imported identity prevents repeated backup imports from multiplying notes.
          const id = `import:${source.id}`
          if (s.notes.some((n) => n.id === id || n.id === source.id)) continue
          const n = {
            ...createNote(target),
            id,
            title: source.title,
            markdown: source.markdown,
            tags: source.tags,
            createdAt: source.createdAt,
            source: 'import' as const,
            folderId: source.folderId ? (map.get(source.folderId) ?? target) : target
          }
          for (const a of source.attachments) {
            const bytes = files[a.id]
            if (!bytes) throw new Error(`缺少附件：${a.name}`)
            const newId = randomUUID()
            assets.put(newId, bytes)
            n.attachments.push({ ...a, id: newId, size: bytes.length })
            n.markdown = n.markdown.replaceAll(`journal-asset:${a.id}`, `journal-asset:${newId}`)
          }
          s.notes.push(n)
          count++
        }
        repo.write(s)
        return count
      })
  }
}
