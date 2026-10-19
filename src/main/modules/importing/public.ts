import { applyImportEdits } from './edits'
import { randomUUID } from 'node:crypto'
import type { ImportPreview, ParsedBook, ImportEdits } from '@shared/contracts/library'
import { importBook } from '../library/public'
import { startTask } from '../tasks/public'
export interface ImportFilesPort {
  choose(): Promise<string | null>
  parse(file: string, encoding: string | undefined, signal: AbortSignal): Promise<ParsedBook>
  store(id: string, book: ParsedBook): Promise<void>
  read(id: string): Promise<ParsedBook>
  remove(id: string): Promise<void>
}
let files: ImportFilesPort
export function configureImporting(port: ImportFilesPort): void {
  files = port
}
function preview(id: string, book: ParsedBook): ImportPreview {
  return {
    id,
    title: book.title,
    author: book.author,
    encoding: book.encoding,
    characters: book.chapters.reduce((n, c) => n + c.content.length, 0),
    chapters: book.chapters.map((c) => ({
      title: c.title,
      length: c.content.length,
      preview: c.content.slice(0, 500)
    })),
    warnings: book.warnings
  }
}
export async function chooseBook(encoding?: string): Promise<string | null> {
  const file = await files.choose()
  if (!file) return null
  if (!/\.(epub|txt)$/i.test(file)) throw new Error('只支持 EPUB 和 TXT')
  return startTask('import', randomUUID(), async (signal, progress) => {
    progress(0, 1)
    const book = await files.parse(file, encoding, signal)
    signal.throwIfAborted()
    const id = randomUUID()
    await files.store(id, book)
    if (signal.aborted) {
      await files.remove(id)
      signal.throwIfAborted()
    }
    progress(1, 1)
    return JSON.stringify(preview(id, book))
  }).id
}
export async function confirmBook(
  id: string,
  title: string,
  author: string,
  edits?: ImportEdits
): Promise<string> {
  const book = await files.read(id)
  const result = importBook(
    applyImportEdits(book, edits),
    title.slice(0, 300),
    author.slice(0, 200)
  )
  // Keep a short-lived managed preview so confirmation can be safely retried after navigation.
  return result.bookId
}
