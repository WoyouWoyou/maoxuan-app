import type {
  ActionItem,
  ActionProgress,
  Diagnosis,
  Mindset,
  ProblemInput,
  Reading,
  Reflection,
  Review,
  SessionData,
  ThreeNotes,
  Passage,
  NoteFeedback
} from '../types'
export type ReadingCommand =
  | { kind: 'problem'; value: ProblemInput }
  | { kind: 'diagnosis'; value: Diagnosis | null }
  | { kind: 'startReading'; value: Reading }
  | { kind: 'removeReading'; id: string }
  | {
      kind: 'readingStatus'
      id: string
      focusQuestion: string
      readDone: boolean
      notesDone: boolean
    }
  | { kind: 'saveNotes'; id: string; value: ThreeNotes }
  | { kind: 'passages'; id: string; value: Passage[] }
  | { kind: 'feedback'; id: string; value: NoteFeedback | null }
  | { kind: 'reflection'; id: string; value: Reflection }
  | { kind: 'removeReflection'; id: string; reflectionId: string }
  | { kind: 'createAction'; value: ActionItem }
  | {
      kind: 'editAction'
      id: string
      value: Pick<
        ActionItem,
        'text' | 'dueDate' | 'status' | 'result' | 'quadrant' | 'purpose' | 'verify'
      >
    }
  | { kind: 'actionProgress'; id: string; value: ActionProgress }
  | { kind: 'removeActionProgress'; id: string; progressId: string }
  | { kind: 'removeAction'; id: string }
  | { kind: 'review'; value: Review }
  | { kind: 'mindset'; value: Mindset | null }
export const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
/** UI projection -> intent commands. The authoritative reducer lives in the main process. */
export function readingCommands(before: SessionData, after: SessionData): ReadingCommand[] {
  const out: ReadingCommand[] = []
  if (changed(before.problem, after.problem)) out.push({ kind: 'problem', value: after.problem })
  if (changed(before.diagnosis, after.diagnosis))
    out.push({ kind: 'diagnosis', value: after.diagnosis })
  for (const r of after.readings) {
    const old = before.readings.find((x) => x.articleId === r.articleId)
    if (!old) {
      out.push({ kind: 'startReading', value: r })
      continue
    }
    if (
      old.focusQuestion !== r.focusQuestion ||
      old.readDone !== r.readDone ||
      old.notesDone !== r.notesDone
    )
      out.push({
        kind: 'readingStatus',
        id: r.articleId,
        focusQuestion: r.focusQuestion,
        readDone: r.readDone,
        notesDone: r.notesDone
      })
    if (changed(old.notes, r.notes))
      out.push({ kind: 'saveNotes', id: r.articleId, value: r.notes })
    if (changed(old.passages, r.passages))
      out.push({ kind: 'passages', id: r.articleId, value: r.passages })
    if (changed(old.feedback, r.feedback))
      out.push({ kind: 'feedback', id: r.articleId, value: r.feedback })
    for (const f of r.reflections)
      if (
        changed(
          old.reflections.find((x) => x.id === f.id),
          f
        )
      )
        out.push({ kind: 'reflection', id: r.articleId, value: f })
    for (const f of old.reflections)
      if (!r.reflections.some((x) => x.id === f.id))
        out.push({ kind: 'removeReflection', id: r.articleId, reflectionId: f.id })
  }
  for (const r of before.readings)
    if (!after.readings.some((x) => x.articleId === r.articleId))
      out.push({ kind: 'removeReading', id: r.articleId })
  for (const a of after.actions) {
    const old = before.actions.find((x) => x.id === a.id)
    if (!old) {
      out.push({ kind: 'createAction', value: a })
      continue
    }
    const fields = ({ text, dueDate, status, result, quadrant, purpose, verify }: ActionItem) => ({
      quadrant,
      purpose,
      verify,
      text,
      dueDate,
      status,
      result
    })
    if (changed(fields(old), fields(a)))
      out.push({ kind: 'editAction', id: a.id, value: fields(a) })
    for (const p of a.progress)
      if (
        changed(
          old.progress.find((x) => x.id === p.id),
          p
        )
      )
        out.push({ kind: 'actionProgress', id: a.id, value: p })
    for (const p of old.progress)
      if (!a.progress.some((x) => x.id === p.id))
        out.push({ kind: 'removeActionProgress', id: a.id, progressId: p.id })
  }
  for (const a of before.actions)
    if (!after.actions.some((x) => x.id === a.id)) out.push({ kind: 'removeAction', id: a.id })
  for (const r of after.reviews)
    if (
      changed(
        before.reviews.find((x) => x.id === r.id),
        r
      )
    )
      out.push({ kind: 'review', value: r })
  if (changed(before.mindset, after.mindset)) out.push({ kind: 'mindset', value: after.mindset })
  return out
}
