import type { Article } from '@shared/types'
import type { BookScope } from '@shared/contracts/library'
import {
  listChapters as listArticles,
  getChapter as getArticle,
  searchChapters as searchArticles
} from '../../modules/library/public'
import { register, toError } from './transport'
export function registerArticleHandlers(): void {
  register<[BookScope | undefined], ReturnType<typeof listArticles>>('articles:list', (scope) =>
    listArticles(scope)
  )
  register<[string, BookScope | undefined], Article | null>('articles:get', (id, scope) =>
    getArticle(id, scope)
  )
  register<[string, number | undefined, BookScope | undefined], ReturnType<typeof searchArticles>>(
    'articles:search',
    (query, limit, scope) => searchArticles(query, limit, scope)
  )
}
