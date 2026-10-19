import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const result = spawnSync(
  require('electron'),
  ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
)
process.exit(result.status ?? 1)
