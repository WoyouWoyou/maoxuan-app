export interface JournalFolder {
  id: string
  parentId: string | null
  name: string
  archived: boolean
  deleted: boolean
}
export interface JournalAttachment {
  id: string
  name: string
  mime: string
  size: number
}
export interface JournalTemplate {
  id: string
  name: string
  category: string
  markdown: string
}
export interface JournalNote {
  templateMarkdown?: string
  id: string
  folderId: string | null
  title: string
  markdown: string
  tags: string[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  deleted: boolean
  source: 'local' | 'import'
  revision: number
  attachments: JournalAttachment[]
}
export interface JournalState {
  templates?: JournalTemplate[]
  folders: JournalFolder[]
  notes: JournalNote[]
}
export type JournalCommand =
  | { kind: 'folderCreate'; name: string; parentId: string | null }
  | { kind: 'folderEdit'; id: string; name: string; parentId: string | null }
  | { kind: 'folderArchive' | 'folderDelete'; id: string; value: boolean }
  | { kind: 'noteCreate'; folderId: string | null; templateId?: string }
  | { kind: 'templateSave'; name: string; noteId: string }
  | { kind: 'templateDelete'; id: string }
  | {
      kind: 'noteSave'
      id: string
      revision: number
      title: string
      markdown: string
      tags: string[]
    }
  | { kind: 'noteMove'; ids: string[]; folderId: string | null }
  | { kind: 'noteComplete' | 'notePurge'; id: string }
  | { kind: 'noteDelete'; id: string; value: boolean }
  | { kind: 'attachmentRemove'; id: string; attachmentId: string }
export interface JournalResult {
  state: JournalState
  selectedId?: string
  earned?: boolean
}
export interface JournalTransferResult {
  cancelled: boolean
  count: number
  message: string
}
export function journalFolderHidden(
  state: JournalState,
  id: string | null,
  field: 'archived' | 'deleted'
): boolean {
  const seen = new Set<string>()
  while (id) {
    if (seen.has(id)) return true
    seen.add(id)
    const f = state.folders.find((f) => f.id === id)
    if (!f) return true
    if (f[field]) return true
    id = f.parentId
  }
  return false
}
export function journalDescendants(state: JournalState, id: string): Set<string> {
  const ids = new Set([id])
  let size = 0
  while (size !== ids.size) {
    size = ids.size
    for (const f of state.folders) if (f.parentId && ids.has(f.parentId)) ids.add(f.id)
  }
  return ids
}
