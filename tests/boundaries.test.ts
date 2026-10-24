import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkBoundaries } from '../scripts/check-boundaries.mjs'
const roots: string[] = []
function project(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-'))
  roots.push(root)
  fs.writeFileSync(
    path.join(root, 'tsconfig.node.json'),
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        moduleResolution: 'Bundler',
        paths: { '@main/*': ['src/main/*'], '@shared/*': ['src/shared/*'] }
      }
    })
  )
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, 'src', name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, source)
  }
  return checkBoundaries(root).errors
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})
describe('architecture rules across the complete source tree', () => {
  it('allows public module dependencies and composition-root wiring', () => {
    expect(
      project({
        'main/modules/library/public.ts': 'export const x=1',
        'main/modules/reading/public.ts': "import {x} from '../library/public'; export const y=x",
        'main/bootstrap.ts': "import {y} from './modules/reading/public'"
      })
    ).toEqual([])
  })
  it('catches alias and dynamic process-boundary violations', () => {
    const errors = project({
      'main/modules/library/public.ts': 'export const x=1',
      'renderer/bad.ts':
        "import {x} from '@main/modules/library/public'; const fs=import('node:fs/promises')"
    })
    expect(errors.filter((e: string) => e.includes('renderer may'))).toHaveLength(2)
  })
  it('checks re-exports, module direction and private imports', () => {
    const errors = project({
      'main/modules/reading/private.ts': 'export const x=1',
      'main/modules/library/public.ts': "export {x} from '../reading/private'"
    })
    expect(errors.some((e: string) => e.includes('forbidden module dependency'))).toBe(true)
    expect(errors.some((e: string) => e.includes('public.ts'))).toBe(true)
  })
  it('catches native I/O requires and IPC bypassing application modules', () => {
    const errors = project({
      'main/modules/library/public.ts': "const fs=require('fs/promises')",
      'main/adapters/sqlite/db.ts': 'export const db=1',
      'main/adapters/electron/ipc.ts': "import {db} from '../sqlite/db'"
    })
    expect(errors.some((e: string) => e.includes('native I/O'))).toBe(true)
    expect(errors.some((e: string) => e.includes('IPC must'))).toBe(true)
  })
  it('finds cycles outside modules without treating comments as imports', () => {
    const errors = project({
      'renderer/a.ts': "export {b} from './b'; export const a=1; // from 'electron'",
      'renderer/b.ts': "import {a} from './a'; export const b=a"
    })
    expect(errors.some((e: string) => e.includes('Circular dependency'))).toBe(true)
    expect(errors.some((e: string) => e.includes('electron'))).toBe(false)
  })
})
