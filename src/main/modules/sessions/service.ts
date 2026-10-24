import { createHash, randomUUID } from 'node:crypto'
import {
  emptySessionData,
  emptyWorkbench,
  type Session,
  type SessionData,
  type SessionMode,
  type SessionPatch,
  type StepKey,
  type ChatMessage
} from '@shared/types'
import type { Book } from '@shared/contracts/library'
import { object, optional, text, oneOf, integer } from '@shared/contracts/validation'
import { assertSessionData } from '@shared/contracts/state-schema'
import { decodeSessionData } from './data'
import type { SessionRepository } from './ports'
export interface SessionDependencies {
  requireBook(id: string): Book
  validate(previous: Session, next: SessionData, restoring: boolean, step?: StepKey): void
}
export function createSessionService(
  repository: SessionRepository,
  dependencies: SessionDependencies
) {
  const getSession = (id: string): Session | null => {
    text(id, 'sessionId')
    return repository.get(id)
  }
  function requireSession(id: string): Session {
    const s = getSession(id)
    if (!s) throw new Error('会话不存在')
    return s
  }
  const listSessions = () => repository.list('active')
  const listArchivedSessions = () => repository.list('archived')
  const listTrashSessions = () => repository.list('trash')
  const steps = {
    reading: ['problem', 'focus', 'relate', 'apply'],
    workbench: ['wb_intake', 'wb_diagnose', 'wb_decide', 'wb_act']
  }
  function validateStep(mode: SessionMode, step: StepKey) {
    if (!steps[mode].includes(step)) throw new Error('会话步骤无效')
  }
  function snapshot(session: Session, label: string) {
    repository.snapshot({
      id: randomUUID(),
      sessionId: session.id,
      versionNo: session.versionNo,
      step: session.currentStep,
      label,
      data: session.data,
      createdAt: session.updatedAt
    })
  }
  function createSession(
    problemText: string,
    mode: SessionMode = 'reading',
    bookId = 'maoxuan'
  ): Session {
    text(problemText, 'problemText')
    oneOf('reading', 'workbench')(mode, 'mode')
    text(bookId, 'bookId')
    const book = dependencies.requireBook(mode === 'workbench' ? 'maoxuan' : bookId)
    if (book.hidden) throw new Error('书籍已隐藏，请先恢复书籍')
    const data = emptySessionData(),
      now = new Date().toISOString(),
      input = problemText.trim()
    data.book = {
      bookId: book.bookId,
      revisionId: book.revisionId,
      title: book.title,
      profile: book.profile,
      profileVersion: '1'
    }
    if (mode === 'workbench') data.workbench = emptyWorkbench(input)
    else data.problem.text = input
    const session: Session = {
      id: randomUUID(),
      title: input.slice(0, 24) || '未命名问题',
      mode,
      currentStep: mode === 'reading' ? 'problem' : 'wb_intake',
      status: 'active',
      deletedAt: null,
      stateVersion: 0,
      versionNo: 1,
      createdAt: now,
      updatedAt: now,
      bookId: book.bookId,
      bookTitle: book.title,
      data
    }
    return repository.transaction(() => {
      repository.insert(session)
      snapshot(session, mode === 'reading' ? '创建问题' : '创建项目')
      return session
    })
  }
  /** The single atomic write boundary. Receipt, optimistic check, validation, state and snapshot commit together. */
  function mutateSession(
    id: string,
    expected: number,
    mutationId: string,
    input: unknown,
    reduce: (latest: Session) => {
      data?: SessionData
      title?: string
      currentStep?: StepKey
      status?: Session['status']
      deletedAt?: string | null
    },
    label?: string,
    restoring = false
  ): Session {
    text(id, 'sessionId')
    text(mutationId, 'mutationId')
    optional(text)(label, 'label')
    if (!mutationId || mutationId.length > 200) throw new Error('缺少有效的写入标识')
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new Error('缺少会话版本，请重新打开问题')
    const signature = createHash('sha256').update(JSON.stringify({ input, label })).digest('hex')
    return repository.transaction(() => {
      const current = requireSession(id),
        receipt = repository.receipt(id, mutationId)
      if (receipt) {
        if (receipt !== signature) throw new Error('写入标识已用于不同的内容')
        return current
      }
      if (current.stateVersion !== expected)
        throw new Error('内容已在其他窗口更新，请重新打开问题后重试')
      const patch = reduce(structuredClone(current)),
        data = patch.data ? decodeSessionData(patch.data) : current.data
      assertSessionData(data)
      if (JSON.stringify(data.book) !== JSON.stringify(current.data.book))
        throw new Error('不能更换已创建问题的书籍，请新建问题')
      const next = {
        ...current,
        ...patch,
        data,
        stateVersion: expected + 1,
        versionNo: current.versionNo + (label ? 1 : 0),
        updatedAt: new Date().toISOString()
      }
      validateStep(next.mode, next.currentStep)
      dependencies.validate(current, data, restoring, next.currentStep)
      if (
        !restoring &&
        JSON.stringify({
          ...next,
          stateVersion: current.stateVersion,
          versionNo: current.versionNo,
          updatedAt: current.updatedAt
        }) === JSON.stringify(current)
      ) {
        repository.remember(id, mutationId, signature)
        return current
      }
      repository.save(next)
      if (label) snapshot(next, label)
      repository.remember(id, mutationId, signature)
      return next
    })
  }
  /** Metadata only. Content changes go through reading.apply or wb.apply. */
  function updateSession(id: string, patch: SessionPatch, label?: string): Session {
    object({
      expectedStateVersion: integer,
      mutationId: text,
      title: optional(text),
      currentStep: optional(text),
      status: optional(oneOf('active', 'archived'))
    })(patch, 'sessionPatch')
    const { expectedStateVersion, mutationId, ...values } = patch
    return mutateSession(id, expectedStateVersion!, mutationId!, values, () => values, label)
  }
  function lifecycle(
    id: string,
    values: { status?: Session['status']; deletedAt?: string | null }
  ): void {
    repository.transaction(() => {
      const s = requireSession(id)
      repository.save({
        ...s,
        ...values,
        stateVersion: (s.stateVersion ?? 0) + 1,
        updatedAt: new Date().toISOString()
      })
    })
  }
  const archiveSession = (id: string) => lifecycle(id, { status: 'archived' })
  const unarchiveSession = (id: string) => lifecycle(id, { status: 'active' })
  const trashSession = (id: string) => lifecycle(id, { deletedAt: new Date().toISOString() })
  const restoreSession = (id: string) => lifecycle(id, { deletedAt: null })
  const removeSession = (id: string) => {
    requireSession(id)
    repository.delete(id)
  }
  const emptyTrash = () => repository.purge()
  const purgeExpiredTrash = (days: number) =>
    repository.purge(new Date(Date.now() - days * 86400000).toISOString())
  const listVersions = (id: string) => {
    requireSession(id)
    return repository.versions(id)
  }
  const getVersion = (id: string) => {
    text(id, 'versionId')
    return repository.version(id)
  }
  function restoreVersion(id: string, expected: number, mutationId: string): Session {
    const v = getVersion(id)
    if (!v) throw new Error('版本不存在')
    return mutateSession(
      v.sessionId,
      expected,
      mutationId,
      { restoreVersion: id },
      () => ({ data: v.data, currentStep: v.step }),
      `恢复自 v${v.versionNo}`,
      true
    )
  }
  const listMessages = (id: string): ChatMessage[] => {
    requireSession(id)
    return repository.messages(id)
  }
  function addMessage(
    sessionId: string,
    role: ChatMessage['role'],
    content: string,
    articleId: string | null = null
  ): ChatMessage {
    requireSession(sessionId)
    oneOf('user', 'assistant')(role, 'role')
    text(content, 'content')
    const message = {
      id: randomUUID(),
      sessionId,
      role,
      content,
      articleId,
      createdAt: new Date().toISOString()
    }
    repository.addMessage(message)
    return message
  }
  const clearMessages = (id: string) => {
    requireSession(id)
    repository.clearMessages(id)
  }

  return {
    getSession,
    requireSession,
    listSessions,
    listArchivedSessions,
    listTrashSessions,
    createSession,
    mutateSession,
    updateSession,
    archiveSession,
    unarchiveSession,
    trashSession,
    restoreSession,
    removeSession,
    emptyTrash,
    purgeExpiredTrash,
    listVersions,
    getVersion,
    restoreVersion,
    listMessages,
    addMessage,
    clearMessages
  }
}
export type SessionService = ReturnType<typeof createSessionService>
