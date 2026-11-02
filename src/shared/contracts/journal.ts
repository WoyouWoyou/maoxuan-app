import {
  array,
  bool,
  integer,
  nullable,
  object,
  oneOf,
  optional,
  tagged,
  text,
  type Schema
} from './validation'
const s = text,
  n = nullable(text)
export const journalCommandSchema = tagged('kind', {
  folderCreate: object({ kind: oneOf('folderCreate'), name: s, parentId: n }),
  folderEdit: object({ kind: oneOf('folderEdit'), id: s, name: s, parentId: n }),
  folderArchive: object({ kind: oneOf('folderArchive'), id: s, value: bool }),
  folderDelete: object({ kind: oneOf('folderDelete'), id: s, value: bool }),
  noteCreate: object({ kind: oneOf('noteCreate'), folderId: n, templateId: optional(s) }),
  templateSave: object({ kind: oneOf('templateSave'), name: s, noteId: s }),
  templateDelete: object({ kind: oneOf('templateDelete'), id: s }),
  noteSave: object({
    kind: oneOf('noteSave'),
    id: s,
    revision: integer,
    title: s,
    markdown: s,
    tags: array(s, 30)
  }),
  noteMove: object({ kind: oneOf('noteMove'), ids: array(s, 1000), folderId: n }),
  noteComplete: object({ kind: oneOf('noteComplete'), id: s }),
  notePurge: object({ kind: oneOf('notePurge'), id: s }),
  noteDelete: object({ kind: oneOf('noteDelete'), id: s, value: bool }),
  attachmentRemove: object({ kind: oneOf('attachmentRemove'), id: s, attachmentId: s })
})
export const journalBytesSchema: Schema = (value) => {
  if (!(value instanceof Uint8Array) || value.length > 100 * 1024 * 1024)
    throw new Error('无效附件数据')
}
