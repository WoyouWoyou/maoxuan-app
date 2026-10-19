import { problemSignature } from '../../modules/reading/context'
import { ipcMain } from 'electron'
import type { Article, Session, WorkbenchData } from '@shared/types'
import type { BookScope } from '@shared/contracts/library'
import { getSession } from '../sqlite/session-repository'
import { getChapter as getArticle, scopeOf } from '../../modules/library/public'
import { withModelContext } from '../../modules/model-runtime/public'
export function toError(error: unknown): Error {
  if (error instanceof Error) return new Error(error.message)
  return new Error(String(error))
}

export function register<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<TResult> => {
    try {
      const execute = () => handler(...(args as unknown as TArgs))
      if ((channel.startsWith('ai:') || channel.startsWith('wb:')) && typeof args[0] === 'string') {
        const session = requireSession(args[0])
        const problem = JSON.stringify(session.data.problem)
        const result = await withModelContext(
          { purpose: channel.replace(':', '_'), sessionId: session.id, ...scopeOf(session.data) },
          execute
        )
        if (JSON.stringify(requireSession(session.id).data.problem) !== problem)
          throw new Error('问题已修改，请按新问题重新生成')
        if (channel.startsWith('ai:') && result && typeof result === 'object') {
          const target = result as any
          const metadata = {
            problemSignature: problemSignature(session.data),
            revisionId: scopeOf(session.data).revisionId
          }
          if (channel === 'ai:reviseProblem') target.diagnosis._context = metadata
          else if (channel === 'ai:findPassages')
            for (const passage of target.passages) passage._context = metadata
          else target._context = metadata
        }
        return result
      }
      return await execute()
    } catch (error) {
      throw toError(error)
    }
  })
}

export function requireSession(id: string): Session {
  const session = getSession(id)
  if (!session) throw new Error('会话不存在')
  return session
}

export function requireArticle(id: string, scope?: BookScope): Article {
  const article = getArticle(id, scope)
  if (!article) throw new Error('文章不存在')
  return article
}

export function requireWorkbench(sessionId: string): WorkbenchData {
  const session = requireSession(sessionId)
  if (session.mode !== 'workbench' || !session.data.workbench)
    throw new Error('这个会话不是工作台模式')
  return session.data.workbench
}
