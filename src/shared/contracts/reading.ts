import type {
  ActionItem,
  Diagnosis,
  Mindset,
  ProblemInput,
  Reading,
  Review,
  SessionData
} from '../types'
export type ReadingCommand =
  | { kind: 'problem'; value: ProblemInput }
  | { kind: 'diagnosis'; value: Diagnosis | null }
  | { kind: 'reading'; value: Reading }
  | { kind: 'removeReading'; id: string }
  | { kind: 'action'; value: ActionItem }
  | { kind: 'removeAction'; id: string }
  | { kind: 'review'; value: Review }
  | { kind: 'mindset'; value: Mindset | null }
export function readingCommands(before: SessionData, after: SessionData): ReadingCommand[] {
  const commands: ReadingCommand[] = []
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  if (changed(before.problem, after.problem))
    commands.push({ kind: 'problem', value: after.problem })
  if (changed(before.diagnosis, after.diagnosis))
    commands.push({ kind: 'diagnosis', value: after.diagnosis })
  for (const r of after.readings)
    if (
      changed(
        before.readings.find((x) => x.articleId === r.articleId),
        r
      )
    )
      commands.push({ kind: 'reading', value: r })
  for (const r of before.readings)
    if (!after.readings.some((x) => x.articleId === r.articleId))
      commands.push({ kind: 'removeReading', id: r.articleId })
  for (const a of after.actions)
    if (
      changed(
        before.actions.find((x) => x.id === a.id),
        a
      )
    )
      commands.push({ kind: 'action', value: a })
  for (const a of before.actions)
    if (!after.actions.some((x) => x.id === a.id)) commands.push({ kind: 'removeAction', id: a.id })
  for (const r of after.reviews)
    if (
      changed(
        before.reviews.find((x) => x.id === r.id),
        r
      )
    )
      commands.push({ kind: 'review', value: r })
  if (changed(before.mindset, after.mindset))
    commands.push({ kind: 'mindset', value: after.mindset })
  return commands
}
export function applyReadingCommands(data: SessionData, commands: ReadingCommand[]): SessionData {
  const next = structuredClone(data)
  if (!Array.isArray(commands) || commands.length > 500) throw new Error('无效的阅读命令')
  for (const c of commands) {
    switch (c.kind) {
      case 'problem':
        if (
          !c.value ||
          typeof c.value.text !== 'string' ||
          typeof c.value.background !== 'string' ||
          typeof c.value.tried !== 'string'
        )
          throw new Error('问题字段无效')
        next.problem = c.value
        break
      case 'diagnosis':
        next.diagnosis = c.value
        break
      case 'reading':
        next.readings = [...next.readings.filter((x) => x.articleId !== c.value.articleId), c.value]
        break
      case 'removeReading':
        next.readings = next.readings.filter((x) => x.articleId !== c.id)
        break
      case 'action':
        next.actions = [...next.actions.filter((x) => x.id !== c.value.id), c.value]
        break
      case 'removeAction':
        next.actions = next.actions.filter((x) => x.id !== c.id)
        break
      case 'review':
        next.reviews = [...next.reviews.filter((x) => x.id !== c.value.id), c.value]
        break
      case 'mindset':
        next.mindset = c.value
        break
      default:
        throw new Error('未知的阅读命令')
    }
  }
  return next
}
