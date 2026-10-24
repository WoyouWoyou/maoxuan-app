import {
  generateDiagnosis,
  generateRevision,
  generatePassages,
  generateFeedback,
  generateReview,
  generateMindset,
  applyCommands
} from '../../modules/reading/public'
import { register } from './transport'
export function registerReadingHandlers(): void {
  register('reading:apply', applyCommands)
  register('ai:diagnose', generateDiagnosis)
  register('ai:reviseProblem', generateRevision)
  register('ai:findPassages', generatePassages)
  register('ai:reviewNotes', generateFeedback)
  register('ai:reviewSituation', generateReview)
  register('ai:mindset', generateMindset)
}
