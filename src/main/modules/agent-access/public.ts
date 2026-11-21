import { createHash, randomUUID } from 'node:crypto'
import { newAction } from '@shared/actions'
import { assertWith, nullable, object, oneOf, optional, text } from '@shared/contracts/validation'
import type { ActionQuadrant } from '@shared/types'
import { createAction } from '../action-planning/public'
import { getSession, listSessions } from '../sessions/public'
import { applyWorkbench } from '../workbench/public'

interface ActionRequest {
  requestId: string
  sessionId?: string
  text: string
  dueDate?: string
  quadrant?: ActionQuadrant | null
  purpose?: string
  verify?: string
}

interface Receipt {
  actionId: string
  sessionId: string | null
  text: string
  dueDate: string
  quadrant: ActionQuadrant | null
}

export interface AgentActionRequests {
  transaction<T>(work: () => T): T
  get(id: string): { signature: string; actionId: string } | undefined
  save(id: string, signature: string, actionId: string): void
}

export class AgentRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const requestSchema = object({
  requestId: text,
  sessionId: optional(text),
  text,
  dueDate: optional(text),
  quadrant: optional(nullable(oneOf('do', 'plan', 'delegate', 'reduce'))),
  purpose: optional(text),
  verify: optional(text)
})

function parseAction(input: unknown) {
  try {
    assertWith<ActionRequest>(requestSchema, input, 'action')
  } catch (error) {
    throw new AgentRequestError(400, (error as Error).message)
  }
  const edit = {
    text: input.text.trim(),
    dueDate: input.dueDate ?? '',
    quadrant: input.quadrant ?? null,
    purpose: input.purpose?.trim() ?? '',
    verify: input.verify?.trim() ?? ''
  }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId))
    throw new AgentRequestError(400, 'requestId 必须是 1–100 位字母、数字、下划线或连字符')
  if (input.sessionId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(input.sessionId))
    throw new AgentRequestError(400, 'sessionId 无效')
  if (!edit.text || edit.text.length > 500)
    throw new AgentRequestError(400, '任务名称必须为 1–500 个字符')
  if (edit.purpose.length > 2000 || edit.verify.length > 2000)
    throw new AgentRequestError(400, '行动目的和完成标准各最多 2000 个字符')
  if (edit.dueDate) {
    const day = edit.dueDate.slice(0, 10)
    const parsed = new Date(day + 'T00:00:00Z')
    if (
      !/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(edit.dueDate) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== day
    )
      throw new AgentRequestError(400, 'dueDate 必须为有效的 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm')
  }
  return { edit, requestId: input.requestId, sessionId: input.sessionId ?? null }
}

export function createAgentActions(requests: AgentActionRequests) {
  return {
    listWorkbenches: () =>
      listSessions()
        .filter((session) => session.mode === 'workbench')
        .map(({ id, title }) => ({ id, title })),
    schedule(input: unknown): { created: boolean; action: Receipt } {
      const { edit, requestId, sessionId } = parseAction(input)
      const signature = createHash('sha256')
        .update(JSON.stringify({ sessionId, edit }))
        .digest('hex')
      const receipt = (actionId: string): Receipt => ({
        actionId,
        sessionId,
        text: edit.text,
        dueDate: edit.dueDate,
        quadrant: edit.quadrant
      })
      return requests.transaction(() => {
        const existing = requests.get(requestId)
        if (existing) {
          if (existing.signature !== signature)
            throw new AgentRequestError(409, 'requestId 已用于不同的任务')
          return { created: false, action: receipt(existing.actionId) }
        }

        let actionId: string
        if (sessionId) {
          const session = getSession(sessionId)
          if (session?.mode !== 'workbench' || session.deletedAt || session.status !== 'active')
            throw new AgentRequestError(404, '没有找到可接收任务的工作台问题')
          actionId = randomUUID()
          const { workbench } = newAction(session, actionId, edit, new Date().toISOString())
          applyWorkbench(
            sessionId,
            workbench,
            session.stateVersion,
            'Agent：安排待办',
            undefined,
            'agent:' + requestId
          )
        } else {
          actionId = createAction(edit).id
        }
        requests.save(requestId, signature, actionId)
        return { created: true, action: receipt(actionId) }
      })
    }
  }
}
