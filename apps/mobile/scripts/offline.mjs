import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../dist/', import.meta.url)
const assets = (await readdir(new URL('assets/', root))).map((f) => `./assets/${f}`)
async function walk(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? walk(new URL(e.name + '/', dir), prefix + e.name + '/') : prefix + e.name
      )
    )
  ).flat()
}
const editor = await walk(new URL('vditor/', root), './vditor/')
const files = ['./', './index.html', './articles.json', ...assets, ...editor]
const version = createHash('sha256')
  .update(await readFile(new URL('index.html', root)))
  .update(await readFile(new URL('articles.json', root)))
  .digest('hex')
  .slice(0, 16)
await writeFile(
  new URL('sw.js', root),
  `const CACHE='maoxuan-mobile-${version}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('maoxuan-mobile-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===self.location.origin)e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true})).then(r=>r||fetch(e.request)));});`
)
console.log('Generated offline cache for production browser preview')
