import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve('src/main/modules')
const files = []
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name)
    if (item.isDirectory()) walk(file)
    else if (file.endsWith('.ts')) files.push(file)
  }
}
walk(root)
const graph = new Map(),
  errors = []
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8'),
    module = path.relative(root, file).split(path.sep)[0]
  for (const [, specifier] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (['electron', 'better-sqlite3', 'node:fs', 'fs'].includes(specifier))
      errors.push(`${file}: native I/O must live in adapters`)
    if (specifier.includes('adapters')) errors.push(`${file}: module depends on concrete adapter`)
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(file), specifier) + '.ts'
      if (target.startsWith(root) && fs.existsSync(target)) {
        const targetModule = path.relative(root, target).split(path.sep)[0]
        if (module !== targetModule && !['public.ts'].includes(path.basename(target)))
          errors.push(`${file}: import another module through its public entry`)
        graph.set(file, [...(graph.get(file) ?? []), target])
      }
    }
    if (specifier === '@shared/core' && !file.includes(`${path.sep}profiles${path.sep}maoxuan`))
      errors.push(`${file}: Mao constants outside its profile`)
  }
}
function visit(file, stack = new Set(), done = new Set()) {
  if (stack.has(file)) {
    errors.push(
      `Circular dependency: ${[...stack, file].map((p) => path.relative(root, p)).join(' -> ')}`
    )
    return
  }
  if (done.has(file)) return
  stack.add(file)
  for (const next of graph.get(file) ?? []) visit(next, stack, done)
  stack.delete(file)
  done.add(file)
}
const done = new Set()
for (const file of files) visit(file, new Set(), done)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(
  `Module boundaries checked: ${files.length} files; no circular or native adapter dependencies`
)
