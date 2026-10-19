import type { ParsedBook, ImportEdits } from '@shared/contracts/library'
export function applyImportEdits(book: ParsedBook, edits?: ImportEdits): ParsedBook {
  if (!edits) return book
  if (edits.titles && edits.titles.length !== book.chapters.length)
    throw new Error('章节编辑与预览不一致')
  const merges = new Set(edits.mergeWithPrevious ?? [])
  for (const index of merges)
    if (!Number.isInteger(index) || index < 1 || index >= book.chapters.length)
      throw new Error('无效的章节合并')
  const chapters: ParsedBook['chapters'] = []
  book.chapters.forEach((chapter, index) => {
    if (merges.has(index)) {
      const previous = chapters[chapters.length - 1]
      previous.content += '\n' + chapter.content
      previous.source += '\n' + chapter.source
    } else
      chapters.push({
        ...chapter,
        title: (edits.titles?.[index] ?? chapter.title).trim().slice(0, 300) || chapter.title
      })
  })
  return { ...book, chapters }
}
