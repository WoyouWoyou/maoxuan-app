import { readingCommandSchema } from '@shared/contracts/ipc'
import { array } from '@shared/contracts/validation'
import type { SessionData } from '@shared/types'
import type { ReadingCommand } from '@shared/contracts/reading'
import { assertSessionData } from '@shared/contracts/state-schema'
import { mutateSession } from '../sessions/public'
import type { StepKey } from '@shared/types'
const upsert = <T extends { id: string }>(values: T[], item: T): T[] =>
  values.some((x) => x.id === item.id)
    ? values.map((x) => (x.id === item.id ? item : x))
    : [...values, item]
export function applyReadingCommands(data: SessionData, commands: ReadingCommand[]): SessionData {
  if (!Array.isArray(commands) || commands.length > 500) throw new Error('无效的阅读命令')
  array(readingCommandSchema, 500)(commands, 'commands')
  const next = structuredClone(data)
  for (const c of commands) {
    if (!c || typeof c !== 'object') throw new Error('无效的阅读命令')
    const reading = () => {
      const r = next.readings.find((x) => x.articleId === ('id' in c ? c.id : ''))
      if (!r) throw new Error('阅读记录不存在')
      return r
    }
    const action = () => {
      const a = next.actions.find((x) => x.id === ('id' in c ? c.id : ''))
      if (!a) throw new Error('行动不存在')
      return a
    }
    switch (c.kind) {
      case 'problem':
        next.problem = c.value
        break
      case 'diagnosis':
        next.diagnosis = c.value
        break
      case 'startReading':
        if (next.readings.some((x) => x.articleId === c.value.articleId))
          throw new Error('阅读记录已存在')
        next.readings.push(c.value)
        break
      case 'removeReading':
        next.readings = next.readings.filter((x) => x.articleId !== c.id)
        break
      case 'readingStatus':
        Object.assign(reading(), {
          focusQuestion: c.focusQuestion,
          readDone: c.readDone,
          notesDone: c.notesDone
        })
        break
      case 'saveNotes':
        reading().notes = c.value
        reading().feedback = null
        break
      case 'passages':
        reading().passages = c.value
        break
      case 'feedback':
        reading().feedback = c.value
        break
      case 'reflection':
        reading().reflections = upsert(reading().reflections, c.value)
        break
      case 'removeReflection':
        reading().reflections = reading().reflections.filter((x) => x.id !== c.reflectionId)
        break
      case 'createAction':
        if (next.actions.some((x) => x.id === c.value.id)) throw new Error('行动已存在')
        next.actions.push(c.value)
        break
      case 'editAction': {
        const a = action()
        if (c.value.quadrant !== undefined) a.quadrant = c.value.quadrant
        if (c.value.purpose !== undefined) a.purpose = c.value.purpose
        if (c.value.verify !== undefined) a.verify = c.value.verify
        a.text = c.value.text
        a.dueDate = c.value.dueDate
        a.status = c.value.status
        a.result = c.value.result
        break
      }
      case 'actionProgress':
        action().progress = upsert(action().progress, c.value)
        break
      case 'removeActionProgress':
        action().progress = action().progress.filter((x) => x.id !== c.progressId)
        break
      case 'removeAction':
        next.actions = next.actions.filter((x) => x.id !== c.id)
        break
      case 'review':
        next.reviews = upsert(next.reviews, c.value)
        break
      case 'mindset':
        next.mindset = c.value
        break
      default:
        throw new Error('未知的阅读命令')
    }
  }
  assertSessionData(next)
  return next
}
export function applyCommands(
  id: string,
  commands: ReadingCommand[],
  expected: number,
  label?: string,
  step?: StepKey,
  mutationId?: string
) {
  return mutateSession(
    id,
    expected,
    mutationId!,
    { commands, step },
    (session) => {
      if (session.mode !== 'reading') throw new Error('阅读会话不存在')
      return {
        data: applyReadingCommands(session.data, commands),
        currentStep: step ?? session.currentStep
      }
    },
    label
  )
}
