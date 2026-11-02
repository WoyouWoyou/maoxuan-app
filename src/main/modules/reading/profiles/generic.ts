import { randomUUID } from 'node:crypto'
import { callJson } from '../../model-runtime/public'
import { candidates } from '../../retrieval/public'
import { scopeOf, getChapter } from '../../library/public'
import { createGenericProfile } from '@shared/engine/generic'
export const {
  diagnose,
  reviseProblem,
  findPassages,
  reviewNotes,
  reviewSituation,
  mindset,
  buildChatMessages
} = createGenericProfile({ callJson, randomUUID, candidates, scopeOf, getChapter })
