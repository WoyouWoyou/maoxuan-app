import type { Article, ArticleMeta, SearchHit } from '@shared/types'
import {
  BUILTIN_BOOK_ID,
  BUILTIN_REVISION_ID,
  type Book,
  type BookScope,
  type ParsedBook
} from '@shared/contracts/library'
export interface LibraryRepository {
  listBooks(hidden?: boolean): Book[]
  requireBook(id?: string): Book
  listChapters(scope?: BookScope): ArticleMeta[]
  getChapter(id: string, scope?: BookScope): Article | null
  searchChapters(query: string, limit?: number, scope?: BookScope): SearchHit[]
  syncBuiltin(
    items: {
      id: string
      title: string
      volume: string
      content: string
      isCore?: boolean
      coreOrder?: number
    }[]
  ): void
  importBook(parsed: ParsedBook, title: string, author: string): Book
  hideBook(id: string, hidden: boolean): void
  titleMap(scope?: BookScope): Map<string, string>
}
let repository: LibraryRepository
export function configureLibrary(value: LibraryRepository): void {
  repository = value
}
export const listBooks: LibraryRepository['listBooks'] = (...a) => repository.listBooks(...a)
export const requireBook: LibraryRepository['requireBook'] = (...a) => repository.requireBook(...a)
export const listChapters: LibraryRepository['listChapters'] = (...a) =>
  repository.listChapters(...a)
export const getChapter: LibraryRepository['getChapter'] = (...a) => repository.getChapter(...a)
export const searchChapters: LibraryRepository['searchChapters'] = (...a) =>
  repository.searchChapters(...a)
export const syncBuiltin: LibraryRepository['syncBuiltin'] = (...a) => repository.syncBuiltin(...a)
export const importBook: LibraryRepository['importBook'] = (...a) => repository.importBook(...a)
export const hideBook: LibraryRepository['hideBook'] = (...a) => repository.hideBook(...a)
export const titleMap: LibraryRepository['titleMap'] = (...a) => repository.titleMap(...a)
export function scopeOf(data: { book?: BookScope }): BookScope {
  return {
    bookId: data.book?.bookId ?? BUILTIN_BOOK_ID,
    revisionId: data.book?.revisionId ?? BUILTIN_REVISION_ID
  }
}
