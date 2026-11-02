import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const source = new URL('../../../resources/articles.json', import.meta.url)
// This tool runs at build time. No desktop or Node modules enter the mobile bundle.
const articles = JSON.parse(await readFile(source, 'utf8')).map((a) => ({
  id: a.id,
  title: a.title,
  volume: a.volume,
  isCore: a.isCore,
  coreOrder: a.coreOrder,
  content: a.content,
  revisionId: createHash('sha256').update(a.content).digest('hex')
}))
await mkdir(new URL('../public/', import.meta.url), { recursive: true })
await writeFile(new URL('../public/articles.json', import.meta.url), JSON.stringify(articles))
console.log(`Prepared ${articles.length} immutable articles`)

await rm(new URL('../public/vditor/', import.meta.url), { recursive: true, force: true })
await cp(
  new URL('../node_modules/vditor/dist/', import.meta.url),
  new URL('../public/vditor/dist/', import.meta.url),
  { recursive: true }
)
