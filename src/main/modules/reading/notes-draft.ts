import { callJson } from '../model-runtime/public'
import { createNotesDrafter } from '@shared/engine/notes-draft'
export const { draftNotes } = createNotesDrafter(callJson)
