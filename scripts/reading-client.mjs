// Developer scripts reuse the production intent mapper instead of an obsolete whole-document IPC.
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(
  new URL('../src/shared/contracts/reading.ts', import.meta.url),
  'utf8'
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
})
const { readingCommands } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)
export function readingClient(api) {
  return async (id, patch, label) => {
    const current = await api(`sessions.get(${JSON.stringify(id)})`)
    const data = structuredClone(patch.data ?? current.data)
    for (const r of data.readings) r.reflections ??= []
    for (const a of data.actions) a.progress ??= []
    const commands = readingCommands(current.data, data)
    return api(
      `reading.apply(${JSON.stringify(id)},${JSON.stringify(commands)},${current.stateVersion},${JSON.stringify(label)},${JSON.stringify(patch.currentStep)})`
    )
  }
}
