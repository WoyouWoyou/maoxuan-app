import { createHash } from 'node:crypto'
import type { SessionData } from '@shared/types'
export function problemSignature(data: SessionData): string {
  return createHash('sha256').update(JSON.stringify(data.problem)).digest('hex')
}
