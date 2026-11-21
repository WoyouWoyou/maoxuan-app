import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
export const CHUNK_BYTES = 384 * 1024
export const MAX_ASSET_BYTES = 100 * 1024 * 1024
export const assetHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes))
export function encodeAsset(bytes: Uint8Array): string {
  const parts: string[] = []
  for (let n = 0; n < bytes.length; n += 4096)
    parts.push(String.fromCharCode(...bytes.subarray(n, n + 4096)))
  return btoa(parts.join(''))
}
export function decodeAsset(text: string): Uint8Array {
  if (
    typeof text !== 'string' ||
    text.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 ||
    text.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(text)
  )
    throw Error('无效附件编码')
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}
export const assetEntityId = (id: string) => `desktop:asset:${id}`
