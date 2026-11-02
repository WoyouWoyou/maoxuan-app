import { getChapter, scopeOf } from '../library/public'
import { fingerprint } from '../sessions/public'
import { assertReadingContext, readingInput } from './context'
import { createReadingValidator } from '@shared/engine/reading-validation'
export const { validateReadingSession } = createReadingValidator({
  getChapter,
  scopeOf,
  fingerprint,
  assertReadingContext,
  readingInput
})
