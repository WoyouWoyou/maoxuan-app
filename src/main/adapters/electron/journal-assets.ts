import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { JournalAssets } from '../../modules/journal/public'
export function createJournalAssets(root: string): JournalAssets {
  mkdirSync(root, { recursive: true })
  const file = (id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效附件ID')
    return join(root, id)
  }
  return {
    put: (id, bytes) => {
      const path = file(id)
      writeFileSync(path + '.tmp', bytes)
      renameSync(path + '.tmp', path)
    },
    get: (id) => new Uint8Array(readFileSync(file(id))),
    remove: (id) => rmSync(file(id), { force: true })
  }
}
