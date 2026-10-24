import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isBuiltin } from 'node:module'
const allowed = {
  'action-planning': ['sessions', 'settings', 'model-runtime', 'reading', 'workbench'],
  chat: ['sessions', 'settings', 'reading', 'workbench', 'library', 'model-runtime'],
  library: [],
  importing: ['library', 'tasks'],
  retrieval: ['library', 'model-runtime', 'tasks'],
  reading: ['library', 'retrieval', 'model-runtime', 'sessions', 'settings'],
  workbench: ['library', 'model-runtime', 'sessions', 'settings'],
  sessions: [],
  settings: ['model-config'],
  'model-config': [],
  'model-runtime': [],
  usage: [],
  tasks: []
}
export function checkBoundaries(project = process.cwd()) {
  const root = path.join(project, 'src'),
    files = [],
    errors = [],
    graph = new Map()
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) walk(f)
      else if (/\.[cm]?[jt]sx?$/.test(f)) files.push(f)
    }
  }
  walk(root)
  const rel = (f) => path.relative(root, f).split(path.sep).join('/')
  const moduleOf = (f) => rel(f).match(/^main\/modules\/([^/]+)\//)?.[1]
  const config = ts.readConfigFile(path.join(project, 'tsconfig.node.json'), ts.sys.readFile)
  const options = config.error
    ? {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        baseUrl: project,
        paths: { '@shared/*': ['src/shared/*'] }
      }
    : ts.parseJsonConfigFileContent(config.config, ts.sys, project).options
  for (const file of files) {
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      ),
      from = rel(file),
      owner = moduleOf(file)
    const imports = []
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        imports.push({
          specifier: node.moduleSpecifier.text,
          typeOnly:
            !!node.isTypeOnly ||
            !!node.importClause?.isTypeOnly ||
            !!node.importClause?.namedBindings?.elements?.every((e) => e.isTypeOnly)
        })
      if (
        ts.isCallExpression(node) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      )
        imports.push({ specifier: node.arguments[0].text, typeOnly: false })
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const { specifier, typeOnly } of imports) {
      const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule
        ?.resolvedFileName
      const local = target && target.startsWith(root + path.sep),
        to = local ? rel(target) : '',
        dependency = local ? moduleOf(target) : undefined
      const error = (message) => errors.push(`${from}: ${message} (${specifier})`)
      if (
        from.startsWith('renderer/') &&
        (!local || !/^(renderer|shared)\//.test(to)) &&
        (local || isBuiltin(specifier) || /^(electron|better-sqlite3)$/.test(specifier))
      )
        error('renderer may only depend on renderer/shared and browser packages')
      if (
        from.startsWith('shared/') &&
        ((local && !to.startsWith('shared/')) ||
          isBuiltin(specifier) ||
          /^(electron|better-sqlite3)$/.test(specifier))
      )
        error('shared must be platform independent')
      if (from.startsWith('preload/') && local && !to.startsWith('shared/'))
        error('preload may only import shared contracts')
      if (owner) {
        if (
          /^(?:node:)?(?:fs|fs\/promises|child_process|worker_threads)$|^electron$|^better-sqlite3$/.test(
            specifier
          )
        )
          error('native I/O belongs in adapters')
        if (local && to.startsWith('main/') && !dependency)
          error('module depends on infrastructure')
        if (dependency && dependency !== owner && !(allowed[owner] ?? []).includes(dependency))
          error(`forbidden module dependency ${owner} -> ${dependency}`)
        if (
          (specifier === '@shared/core' || to === 'shared/core.ts') &&
          !/^main\/modules\/(reading\/profiles\/maoxuan[^/]*|workbench\/)/.test(from)
        )
          error('Mao constants outside specialized profile')
      }
      if (dependency && owner !== dependency && path.basename(target) !== 'public.ts')
        error('access another module through public.ts')
      if (from.startsWith('main/adapters/electron/') && to.startsWith('main/adapters/sqlite/'))
        error('IPC must call application modules, not SQLite')
      if (local && !typeOnly) graph.set(file, [...(graph.get(file) ?? []), target])
    }
  }
  const done = new Set(),
    stack = []
  const visit = (file) => {
    if (stack.includes(file)) {
      errors.push(
        `Circular dependency: ${[...stack.slice(stack.indexOf(file)), file].map(rel).join(' -> ')}`
      )
      return
    }
    if (done.has(file)) return
    stack.push(file)
    for (const next of graph.get(file) ?? []) visit(next)
    stack.pop()
    done.add(file)
  }
  for (const file of files) visit(file)
  return { files: files.length, errors }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkBoundaries(process.argv[2])
  if (result.errors.length) {
    console.error(result.errors.join('\n'))
    process.exitCode = 1
  } else
    console.log(
      `Architecture boundaries checked: ${result.files} source files; module, process and cycle rules passed`
    )
}
