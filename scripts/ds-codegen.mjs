#!/usr/bin/env node
// Headless DeepSeek code generation.
// Usage: node scripts/ds-codegen.mjs tasks/01-main.json [tasks/02-x.json ...] [--note path/to/extra.md]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOG_DIR = path.join(ROOT, '.codegen')

function loadEnv() {
  const envFile = path.join(ROOT, '.env')
  if (!fs.existsSync(envFile)) return
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const ALWAYS_CONTEXT = ['SPEC.md', 'src/shared/types.ts', 'src/shared/api.ts', 'src/shared/core.ts', 'package.json', 'electron.vite.config.ts']

const SYSTEM = `你是资深 TypeScript / Electron / React 工程师，负责按规格编写生产级代码。
硬性要求：
- 严格遵守 SPEC.md 与 src/shared 下的类型契约，不得修改或重新定义这些共享类型，直接 import 使用（别名 @shared/...）。
- 只输出任务要求的文件，每个文件必须完整（不要省略、不要“...其余不变”）。
- 输出格式严格如下，文件之间不要有任何其他文字：
<<<FILE: 相对路径>>>
文件完整内容
<<<END FILE>>>
- 不要用 markdown 代码围栏包裹文件内容。
- TypeScript strict 可通过编译；不要使用未安装的依赖（只允许 package.json 中已有的依赖与 Node/Electron 内置模块）。
- UI 文案一律中文。代码注释少而精。`

function readCtx(rel) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return `<<<CONTEXT: ${rel}>>>\n(文件尚不存在)\n<<<END CONTEXT>>>`
  return `<<<CONTEXT: ${rel}>>>\n${fs.readFileSync(abs, 'utf8')}\n<<<END CONTEXT>>>`
}

async function callDeepSeek(messages, label) {
  const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      messages,
      stream: true,
      temperature: 0.2,
      max_tokens: 64000
    })
  })
  if (!res.ok) throw new Error(`[${label}] HTTP ${res.status}: ${await res.text()}`)
  const decoder = new TextDecoder()
  let buf = ''
  let content = ''
  let reasoning = 0
  let lastLog = Date.now()
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta ?? {}
        if (delta.content) content += delta.content
        if (delta.reasoning_content) reasoning += delta.reasoning_content.length
      } catch {
        /* keep-alive or partial line */
      }
    }
    if (Date.now() - lastLog > 15000) {
      console.log(`[${label}] reasoning=${reasoning} chars, content=${content.length} chars`)
      lastLog = Date.now()
    }
  }
  return content
}

function parseFiles(text) {
  const re = /<<<FILE:\s*(.+?)\s*>>>\r?\n([\s\S]*?)\r?\n<<<END FILE>>>/g
  const files = []
  let m
  while ((m = re.exec(text))) {
    let body = m[2]
    const fence = body.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/)
    if (fence) body = fence[1]
    files.push({ path: m[1].trim(), content: body.endsWith('\n') ? body : body + '\n' })
  }
  return files
}

async function runTask(taskFile, note) {
  const task = JSON.parse(fs.readFileSync(path.join(ROOT, taskFile), 'utf8'))
  const ctxFiles = [...new Set([...ALWAYS_CONTEXT, ...(task.context || [])])]
  const user = [
    ...ctxFiles.map(readCtx),
    `# 任务：${task.name}`,
    task.instructions,
    note ? `# 附加说明（审查意见 / 编译错误，必须全部处理）\n${note}` : '',
    `# 需要输出的文件\n${task.files.map((f) => `- ${f}`).join('\n')}`
  ].join('\n\n')

  const label = task.name
  console.log(`[${label}] start, prompt=${user.length} chars`)
  const t0 = Date.now()
  const out = await callDeepSeek([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], label)
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(path.join(LOG_DIR, `${path.basename(taskFile, '.json')}.${stamp}.txt`), out)

  const allowed = new Set(task.files)
  const files = parseFiles(out)
  const written = []
  for (const f of files) {
    if (!allowed.has(f.path)) {
      console.warn(`[${label}] skip unexpected file ${f.path}`)
      continue
    }
    const abs = path.join(ROOT, f.path)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, f.content)
    written.push(f.path)
  }
  const missing = task.files.filter((f) => !written.includes(f))
  console.log(`[${label}] done in ${((Date.now() - t0) / 1000).toFixed(0)}s, wrote ${written.length}/${task.files.length}` + (missing.length ? `, MISSING: ${missing.join(', ')}` : ''))
  return missing.length === 0
}

async function main() {
  loadEnv()
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY missing (.env)')
  const args = process.argv.slice(2)
  let note = ''
  const noteIdx = args.indexOf('--note')
  if (noteIdx >= 0) {
    note = fs.readFileSync(path.join(ROOT, args[noteIdx + 1]), 'utf8')
    args.splice(noteIdx, 2)
  }
  const results = await Promise.allSettled(args.map((t) => runTask(t, note)))
  let ok = true
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      ok = false
      console.error(`${args[i]} failed:`, r.reason?.message || r.reason)
    } else if (!r.value) ok = false
  })
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
