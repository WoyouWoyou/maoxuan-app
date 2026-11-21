import { randomUUID } from 'node:crypto'
import { callJson } from '../../model-runtime/public'
import { createMaoxuanProfile } from '@shared/engine/maoxuan'
export const {
  diagnose,
  reviseProblem,
  findPassages,
  reviewNotes,
  reviewSituation,
  mindset,
  buildChatMessages
} = createMaoxuanProfile({ callJson, randomUUID })
