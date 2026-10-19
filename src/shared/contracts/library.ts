export const BUILTIN_BOOK_ID = 'maoxuan'
export const BUILTIN_REVISION_ID = 'maoxuan-v1'
export type ReadingProfile = 'maoxuan' | 'generic'
export interface BookScope {
  bookId: string
  revisionId: string
}
export interface SourceRef extends BookScope {
  chapterId: string
  paragraphId: string
}
export interface Book extends BookScope {
  title: string
  author: string
  format: 'builtin' | 'epub' | 'txt'
  profile: ReadingProfile
  chapters: number
  characters: number
  createdAt: string
  hidden: boolean
  indexed: number
}
export interface ParsedChapter {
  title: string
  path: string
  content: string
  source: string
  synthetic?: boolean
}
export interface ParsedBook {
  title: string
  author: string
  format: 'epub' | 'txt'
  hash: string
  encoding: string
  chapters: ParsedChapter[]
  warnings: string[]
}
export interface ImportPreview {
  id: string
  title: string
  author: string
  encoding: string
  characters: number
  chapters: { title: string; length: number; preview: string }[]
  warnings: string[]
}
export interface Task {
  id: string
  kind: 'import' | 'index'
  scope: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  progress: number
  total: number
  error: string | null
  result: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export interface ImportEdits {
  titles?: string[]
  mergeWithPrevious?: number[]
}
