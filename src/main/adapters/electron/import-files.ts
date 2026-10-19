import { Worker } from 'node:worker_threads'
import { dialog, app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ParsedBook } from '@shared/contracts/library'
async function parse(
  file: string,
  encoding: string | undefined,
  signal: AbortSignal
): Promise<ParsedBook> {
  const stat = await fs.stat(file)
  if (stat.size > 20 * 1024 * 1024) throw new Error('首版支持不超过 20 MB 的电子书')
  const bytes = await fs.readFile(file)
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'parser-worker.js'), {
      workerData: { bytes, name: path.basename(file), encoding }
    })
    const cancel = () => {
      void worker.terminate()
      reject(new Error('已取消解析'))
    }
    signal.addEventListener('abort', cancel, { once: true })
    worker.once('message', (m) => {
      signal.removeEventListener('abort', cancel)
      void worker.terminate()
      m.error ? reject(new Error(m.error)) : resolve(m.result)
    })
    worker.once('error', (e) => {
      signal.removeEventListener('abort', cancel)
      reject(e)
    })
    worker.once('exit', (code) => {
      signal.removeEventListener('abort', cancel)
      if (code !== 0) reject(new Error('解析进程结束，请重试'))
    })
  })
}

function previewPath(id: string): string {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('无效的导入预览')
  return path.join(app.getPath('userData'), 'import-previews', `${id}.json`)
}
export function createImportFilesAdapter() {
  const folder = path.join(app.getPath('userData'), 'import-previews')
  void fs
    .readdir(folder)
    .then(async (names) => {
      for (const name of names) {
        if (!/^[\da-f-]{36}\.json$/i.test(name)) continue
        const file = path.join(folder, name)
        const stat = await fs.stat(file)
        if (stat.mtimeMs < Date.now() - 7 * 86400000) await fs.unlink(file)
      }
    })
    .catch(() => {})
  return {
    choose: async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: '导入电子书',
        properties: ['openFile'],
        filters: [{ name: '电子书', extensions: ['epub', 'txt'] }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    parse,
    store: async (id: string, book: ParsedBook): Promise<void> => {
      const file = previewPath(id)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(book))
    },
    read: async (id: string): Promise<ParsedBook> =>
      JSON.parse(await fs.readFile(previewPath(id), 'utf8')),
    remove: async (id: string): Promise<void> => {
      await fs.unlink(previewPath(id)).catch(() => {})
    }
  }
}
