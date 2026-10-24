import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'

export async function loadSpeechTools() {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: { '@shared': path.resolve('src/shared') } }
  })
  try {
    const reader = await server.ssrLoadModule('/src/shared/contracts/reader.ts')
    const cache = await server.ssrLoadModule('/src/main/adapters/speech/cache.ts')
    const edge = await server.ssrLoadModule('/src/main/adapters/speech/edge.ts')
    return { ...reader, ...cache, ...edge, close: () => server.close() }
  } catch (error) {
    await server.close()
    throw error
  }
}
export async function coreAudioPlan(tools) {
  const articles = JSON.parse(await fs.readFile('resources/articles.json', 'utf8'))
    .filter((article) => article.isCore)
    .sort((a, b) => a.coreOrder - b.coreOrder)
  if (articles.length !== 5) throw new Error('内置核心篇目必须恰好为五篇')
  const voice = tools.DEFAULT_READER_PREFERENCES.voice
  return {
    version: 1,
    voice,
    format: 'audio-24khz-48kbitrate-mono-mp3',
    articles: articles.map((article) => {
      // Match writeParagraphs and syncBuiltin exactly, preserving the reader's paragraph indices.
      const paragraphs = article.content
        .replace(/^\*\s*\n/, '')
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
      return {
        id: article.id,
        title: article.title,
        paragraphs: paragraphs.map((text, index) => ({
          index,
          chunks: tools
            .speechChunks(text)
            .map((text) => ({ text, key: tools.speechCacheKey({ text, voice }) }))
        }))
      }
    })
  }
}
