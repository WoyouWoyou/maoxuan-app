import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { coreAudioPlan, loadSpeechTools } from './core-audio-plan.mjs'

export async function checkCoreAudio() {
  const tools = await loadSpeechTools()
  try {
    const directory = path.resolve('resources/core-audio/v1')
    let manifest
    try {
      manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'))
    } catch (error) {
      throw new Error('核心五篇音频清单缺失或无效，请先执行 npm run audio:generate', {
        cause: error
      })
    }
    const expected = await coreAudioPlan(tools)
    if (
      manifest.version !== expected.version ||
      manifest.voice !== expected.voice ||
      manifest.format !== expected.format ||
      manifest.articles?.length !== 5
    )
      throw new Error('核心五篇音频版本、格式或音色不匹配')
    const cache = tools.createSpeechCache(directory, async () => {
      throw new Error('内置音频缺失或损坏，请执行 npm run audio:generate 修复')
    })
    const checked = new Set()
    let bytes = 0
    for (let i = 0; i < expected.articles.length; i++) {
      const article = expected.articles[i],
        actual = manifest.articles[i]
      if (
        actual.id !== article.id ||
        actual.title !== article.title ||
        actual.paragraphs?.length !== article.paragraphs.length
      )
        throw new Error(`内置音频篇目/段落不匹配：${article.title}`)
      for (let p = 0; p < article.paragraphs.length; p++) {
        const paragraph = article.paragraphs[p],
          listed = actual.paragraphs[p]
        if (listed.index !== paragraph.index || listed.chunks?.length !== paragraph.chunks.length)
          throw new Error(`内置音频片段数量不匹配：${article.title} 第 ${p + 1} 段`)
        for (let c = 0; c < paragraph.chunks.length; c++) {
          const chunk = paragraph.chunks[c],
            info = listed.chunks[c]
          if (info.key !== chunk.key)
            throw new Error(`内置音频正文已变化：${article.title} 第 ${p + 1} 段`)
          const audio = await cache.get(
            { id: chunk.key, text: chunk.text, voice: expected.voice },
            new AbortController().signal
          )
          if (
            audio.length !== info.bytes ||
            createHash('sha256').update(audio).digest('hex') !== info.sha256
          )
            throw new Error(`内置音频校验失败：${article.title} 第 ${p + 1} 段`)
          if (!checked.has(chunk.key)) {
            checked.add(chunk.key)
            bytes += audio.length
          }
        }
      }
    }
    if (checked.size !== manifest.uniqueChunks) throw new Error('内置音频去重片段数量不匹配')
    const result = { articles: 5, voice: manifest.voice, chunks: checked.size, bytes }
    console.log(`Core audio verified: ${JSON.stringify(result)}`)
    return result
  } finally {
    await tools.close()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkCoreAudio()
}
