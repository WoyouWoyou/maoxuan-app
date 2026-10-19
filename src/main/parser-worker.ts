import { parentPort, workerData } from 'node:worker_threads'
import { parseTxt, parseEpub } from './adapters/importing/parser'
try {
  const { bytes, name, encoding } = workerData
  parentPort!.postMessage({
    result: /\.epub$/i.test(name) ? parseEpub(bytes, name) : parseTxt(bytes, name, encoding)
  })
} catch (e) {
  parentPort!.postMessage({ error: e instanceof Error ? e.message : '无法解析文件' })
}
