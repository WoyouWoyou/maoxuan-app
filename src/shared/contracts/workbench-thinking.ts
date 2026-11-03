import { array, nullable, object, oneOf, optional, text } from './validation'
import type { Schema } from './validation'

const aspect = object({ name: text, strength: text, weakness: text })
export const createThinkingResultSchema = (contextSchema: Schema, wbActionSchema: Schema): Schema =>
  object({
    _context: optional((value, path) => contextSchema(value, path)),
    method: oneOf('contradiction', 'objSubj'),
    situation: text,
    status: oneOf('ready', 'tentative', 'needs_info'),
    summary: text,
    information: array(
      object({
        key: text,
        state: oneOf('sufficient', 'partial', 'missing'),
        evidence: text,
        judgment: text,
        missing: text
      }),
      5
    ),
    questions: array(object({ question: text, why: text }), 2),
    contradiction: nullable(
      object({
        all: array(text, 8),
        primary: text,
        why: text,
        mainAspect: aspect,
        secondaryAspect: aspect,
        turningConditions: array(text, 5),
        leverage: text
      })
    ),
    objSubj: nullable(
      object({
        objective: text,
        subjective: text,
        quadrant: oneOf('act', 'build', 'redirect', 'stop', 'unknown'),
        conclusion: text,
        gap: text
      })
    ),
    notNow: array(text, 3),
    actions: array((value, path) => wbActionSchema(value, path), 3),
    generatedAt: text
  })
