import { dialog } from 'electron'
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { JournalCommand, JournalState, JournalTransferResult } from '@shared/journal'
import { journalDescendants, journalFolderHidden } from '@shared/journal'
import { journalService } from '../../modules/journal/public'
import { register } from './transport'
function validateBackup(value: unknown): asserts value is JournalState {
  if (!value || typeof value !== 'object') throw new Error('无效备份')
  const s = value as JournalState
  if (
    !Array.isArray(s.folders) ||
    !Array.isArray(s.notes) ||
    s.notes.length > 10000 ||
    s.folders.length > 10000
  )
    throw new Error('备份格式或数量无效')
  if (
    s.templates !== undefined &&
    (!Array.isArray(s.templates) ||
      s.templates.length > 1000 ||
      s.templates.some(
        (t) =>
          !t ||
          typeof t.id !== 'string' ||
          typeof t.name !== 'string' ||
          t.name.length > 100 ||
          typeof t.markdown !== 'string' ||
          t.markdown.length > 1000000
      ))
  )
    throw new Error('无效模板清单')
  const ids = new Set<string>()
  for (const f of s.folders) {
    if (
      !f ||
      typeof f.id !== 'string' ||
      typeof f.name !== 'string' ||
      !(f.parentId === null || typeof f.parentId === 'string') ||
      ids.has(f.id)
    )
      throw new Error('无效目录')
    ids.add(f.id)
  }
  const notes = new Set<string>()
  for (const n of s.notes) {
    if (
      !n ||
      typeof n.id !== 'string' ||
      notes.has(n.id) ||
      typeof n.title !== 'string' ||
      typeof n.markdown !== 'string' ||
      n.markdown.length > 5e6 ||
      !Array.isArray(n.tags) ||
      !n.tags.every((t) => typeof t === 'string') ||
      typeof n.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(n.createdAt)) ||
      !(n.folderId === null || ids.has(n.folderId)) ||
      !Array.isArray(n.attachments)
    )
      throw new Error('无效笔记')
    notes.add(n.id)
    for (const a of n.attachments)
      if (
        !a ||
        !/^[a-f0-9-]{36}$/.test(a.id) ||
        typeof a.name !== 'string' ||
        !/^(audio|image)\/[a-z0-9]+$/.test(a.mime)
      )
        throw new Error('无效附件清单')
  }
}
const extension = (mime: string) =>
  ({
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
  })[mime] ?? 'bin'
const cancelled = (): JournalTransferResult => ({ cancelled: true, count: 0, message: '已取消' })
export function registerJournalHandlers() {
  register('journal:list', () => journalService().read())
  register('journal:apply', (command: JournalCommand) => journalService().apply(command))
  register('journal:attach', (id: string, name: string, mime: string, bytes: Uint8Array) =>
    journalService().attach(id, name, mime, bytes)
  )
  register('journal:media', (id: string) => journalService().media(id))
  register('journal:import', async (target: string | null) => {
    const pick = await dialog.showOpenDialog({
      title: '导入笔记或完整备份',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown 或备份', extensions: ['md', 'markdown', 'zip'] }]
    })
    if (pick.canceled) return cancelled()
    const state: JournalState = { folders: [], notes: [] }
    const assets: Record<string, Uint8Array> = {}
    for (const path of pick.filePaths) {
      const data = readFileSync(path)
      if (data.length > 200 * 1024 * 1024) throw new Error('文件超过200MB限制')
      if (/\.zip$/i.test(path)) {
        let total = 0
        const files = unzipSync(data, {
          filter: (entry) => {
            total += entry.originalSize
            if (
              total > 300 * 1024 * 1024 ||
              entry.originalSize > 100 * 1024 * 1024 ||
              /(^\/|\\|(^|\/)\.\.(\/|$))/.test(entry.name)
            )
              throw new Error('备份路径或解压大小无效')
            return true
          }
        })
        if (!files['manifest.json']) throw new Error('请选择本应用导出的完整备份ZIP')
        const manifest = JSON.parse(strFromU8(files['manifest.json']))
        if (manifest.version !== 1) throw new Error('不支持的备份版本')
        validateBackup(manifest.state)
        state.templates ??= []
        state.templates.push(...(manifest.state.templates ?? []))
        state.folders.push(...manifest.state.folders)
        state.notes.push(...manifest.state.notes)
        for (const n of manifest.state.notes)
          for (const a of n.attachments) {
            const bytes = files[`assets/${a.id}.${extension(a.mime)}`] ?? files[`assets/${a.id}`]
            if (!bytes) throw new Error(`缺少附件：${a.name}`)
            assets[a.id] = bytes
          }
      } else {
        if (data.length > 5e6) throw new Error('单篇文字超过5MB限制')
        const markdown = data.toString('utf8')
        const now = new Date().toISOString()
        state.notes.push({
          id: createHash('sha256').update(data).digest('hex'),
          folderId: null,
          title: basename(path).replace(/\.(md|markdown)$/i, ''),
          markdown,
          tags: [],
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          deleted: false,
          source: 'import',
          revision: 0,
          attachments: []
        })
      }
    }
    validateBackup(state)
    const confirmation = await dialog.showMessageBox({
      type: 'question',
      title: '导入预览',
      message: `导入 ${state.notes.length} 篇笔记、${state.folders.length} 个文件夹`,
      detail: '同一备份中的已有笔记会跳过。导入笔记不会增加成长值；正文中的外部附件链接保持原文。',
      buttons: ['导入', '取消'],
      defaultId: 0,
      cancelId: 1
    })
    if (confirmation.response !== 0) return cancelled()
    const count = journalService().importRecords(state, assets, target)
    return {
      cancelled: false,
      count,
      message: `已导入${count}篇，跳过${state.notes.length - count}篇重复记录`
    }
  })
  register('journal:export', async (folderId: string | null, noteId?: string) => {
    const all = journalService().read()
    const ids = folderId ? journalDescendants(all, folderId) : null
    const state: JournalState = {
      templates: noteId ? [] : all.templates,
      folders: all.folders
        .filter((f) => !journalFolderHidden(all, f.id, 'deleted') && (!ids || ids.has(f.id)))
        .map((f) => ({
          ...f,
          parentId: f.parentId && ids && !ids.has(f.parentId) ? null : f.parentId
        })),
      notes: all.notes.filter(
        (n) =>
          !n.deleted &&
          !journalFolderHidden(all, n.folderId, 'deleted') &&
          (!ids || (n.folderId && ids.has(n.folderId)))
      )
    }
    if (noteId) {
      const n = state.notes.find((n) => n.id === noteId)
      if (!n) throw new Error('记录不存在或已删除')
      state.notes = [{ ...n, folderId: null }]
      state.folders = []
    }
    const plain = !!noteId && state.notes[0].attachments.length === 0
    const picked = await dialog.showSaveDialog({
      title: '导出笔记与附件',
      defaultPath: plain ? '日常记录.md' : '日常记录备份.zip',
      filters: plain
        ? [
            { name: 'Markdown', extensions: ['md'] },
            { name: '完整备份', extensions: ['zip'] }
          ]
        : [{ name: '完整备份', extensions: ['zip'] }]
    })
    if (picked.canceled || !picked.filePath) return cancelled()
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(JSON.stringify({ version: 1, state }, null, 2))
    }
    const safe = (name: string) =>
      name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || '未命名'
    const folderPath = (id: string | null): string => {
      const f = state.folders.find((f) => f.id === id)
      return f ? `${folderPath(f.parentId)}${safe(f.name)}-${f.id.slice(0, 8)}/` : ''
    }
    for (const n of state.notes) {
      let markdown = `# ${n.title || '未命名记录'}\n\n${n.markdown}`
      const dir = folderPath(n.folderId)
      const prefix = '../'.repeat(dir.split('/').filter(Boolean).length)
      for (const a of n.attachments) {
        const bytes = journalService().media(a.id).bytes
        files[`assets/${a.id}.${extension(a.mime)}`] = bytes
        markdown = markdown.replaceAll(
          `journal-asset:${a.id}`,
          `${prefix}assets/${a.id}.${extension(a.mime)}`
        )
        markdown += `\n\n${a.mime.startsWith('image/') ? '!' : ''}[${a.name.replace(/[\[\]]/g, '')}](${prefix}assets/${a.id}.${extension(a.mime)})\n`
      }
      files[`${dir}${safe(n.title)}-${safe(n.id)}.md`] = strToU8(markdown)
    }
    const path = picked.filePath
    try {
      const payload =
        plain && /\.md$/i.test(path)
          ? strToU8(`# ${state.notes[0].title || '未命名记录'}\n\n${state.notes[0].markdown}`)
          : zipSync(files)
      writeFileSync(path + '.tmp', payload)
      renameSync(path + '.tmp', path)
    } catch (e) {
      rmSync(path + '.tmp', { force: true })
      throw e
    }
    return {
      cancelled: false,
      count: state.notes.length,
      message: `已导出${state.notes.length}篇及全部附件`
    }
  })
}
