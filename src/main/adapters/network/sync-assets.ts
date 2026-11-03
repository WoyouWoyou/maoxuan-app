import {
  CHUNK_BYTES,
  MAX_ASSET_BYTES,
  assetHash,
  encodeAsset,
  decodeAsset
} from '@shared/sync/assets'
import type { SyncDocument } from '@shared/sync/protocol'
import type { JournalAssets } from '../../modules/journal/public'
export function createAssetExchange(read: () => SyncDocument[], assets: JournalAssets) {
  const uploads = new Map<
    string,
    { total: number; sha256: string; offset: number; chunks: Uint8Array[] }
  >()
  let cached: { id: string; bytes: Uint8Array; sha256: string } | undefined
  return (input: {
    operation: string
    id: string
    offset?: number
    total?: number
    sha256?: string
    data?: string
  }) => {
    if (
      !input ||
      !['asset-probe', 'asset-read', 'asset-write'].includes(input.operation) ||
      !/^[a-f0-9-]{36}$/.test(input.id)
    )
      throw Error('无效附件请求')
    const info = read()
      .flatMap((d) => (d.kind === 'note' ? d.value.attachments : []))
      .find((a) => a.id === input.id)
    if (!info) throw Error('附件不在已授权的笔记清单中')
    const get = () => {
      if (cached?.id !== input.id) {
        let bytes: Uint8Array
        try {
          bytes = assets.get(input.id)
        } catch {
          throw Error('源设备附件文件缺失，正文已保留，可恢复附件后重试')
        }
        if (bytes.length !== info.size) throw Error('附件大小与清单不一致')
        cached = { id: input.id, bytes, sha256: assetHash(bytes) }
      }
      return cached!
    }
    if (input.operation === 'asset-probe') {
      try {
        const file = get()
        return { exists: true, total: file.bytes.length, sha256: file.sha256 }
      } catch {
        return { exists: false }
      }
    }
    if (!Number.isInteger(input.offset) || input.offset! < 0) throw Error('无效附件偏移')
    if (input.operation === 'asset-read') {
      const file = get()
      if (input.offset! >= file.bytes.length) throw Error('附件偏移超出范围')
      return {
        offset: input.offset,
        total: file.bytes.length,
        sha256: file.sha256,
        data: encodeAsset(file.bytes.subarray(input.offset!, input.offset! + CHUNK_BYTES))
      }
    }
    if (
      input.total !== info.size ||
      input.total > MAX_ASSET_BYTES ||
      !/^[a-f0-9]{64}$/.test(input.sha256 ?? '')
    )
      throw Error('无效附件大小或校验值')
    let existing: ReturnType<typeof get> | undefined
    try {
      existing = get()
    } catch {}
    if (existing) {
      if (existing.sha256 !== input.sha256) throw Error('附件身份冲突，原附件保持不变')
      return { complete: true }
    }
    if (input.offset === 0) {
      if ([...uploads.values()].reduce((n, x) => n + x.offset, 0) > MAX_ASSET_BYTES) uploads.clear()
      uploads.set(input.id, { total: input.total, sha256: input.sha256!, offset: 0, chunks: [] })
    }
    const entry = uploads.get(input.id)
    if (
      !entry ||
      entry.offset !== input.offset ||
      entry.total !== input.total ||
      entry.sha256 !== input.sha256
    )
      throw Error('附件传输已中断，请重新同步')
    if (typeof input.data !== 'string' || input.data.length > Math.ceil(CHUNK_BYTES / 3) * 4)
      throw Error('附件分块过大')
    const chunk = decodeAsset(input.data)
    if (!chunk.length || chunk.length > CHUNK_BYTES || entry.offset + chunk.length > entry.total)
      throw Error('附件分块无效')
    if ([...uploads.values()].reduce((n, x) => n + x.offset, 0) + chunk.length > MAX_ASSET_BYTES)
      throw Error('附件暂存空间已满，请重试')
    entry.chunks.push(chunk)
    entry.offset += chunk.length
    if (entry.offset === entry.total) {
      const bytes = new Uint8Array(entry.total)
      let n = 0
      for (const part of entry.chunks) {
        bytes.set(part, n)
        n += part.length
      }
      uploads.delete(input.id)
      if (assetHash(bytes) !== entry.sha256) throw Error('附件校验失败，未保存')
      assets.put(input.id, bytes)
      cached = undefined
      return { complete: true }
    }
    return { complete: false, offset: entry.offset }
  }
}
