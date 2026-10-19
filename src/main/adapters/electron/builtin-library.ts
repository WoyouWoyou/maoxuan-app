// Legacy article contract; immutable content and book-scoped reads are owned by library.
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  syncBuiltin,
  listChapters,
  getChapter,
  searchChapters,
  titleMap
} from '../../modules/library/public'
export function loadArticles(): void {
  const file = app.isPackaged
    ? path.join(process.resourcesPath, 'articles.json')
    : path.join(app.getAppPath(), 'resources/articles.json')
  syncBuiltin(JSON.parse(fs.readFileSync(file, 'utf8')))
}
