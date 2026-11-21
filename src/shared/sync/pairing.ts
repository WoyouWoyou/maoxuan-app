import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

export const pairingHash = (value: string): string => bytesToHex(sha256(utf8ToBytes(value)))

export function pairingCode(fingerprint: string, phoneNonce: string, desktopNonce: string): string {
  const digest = pairingHash(`${fingerprint}:${phoneNonce}:${desktopNonce}`)
  return String(Number.parseInt(digest.slice(0, 12), 16) % 1000000).padStart(6, '0')
}
