import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import { generate } from 'selfsigned'
/** Stable installation identity, encrypted by the OS; never enters sync packets or backups. */
export function certificateStore(path: string) {
  return async () => {
    if (!safeStorage.isEncryptionAvailable()) throw Error('系统安全存储不可用，无法开启设备同步')
    if (existsSync(path)) {
      const pem = JSON.parse(safeStorage.decryptString(readFileSync(path))) as {
        cert: string
        private: string
      }
      if (new Date(new X509Certificate(pem.cert).validTo).getTime() > Date.now() + 86400000)
        return pem
    }
    const pem = await generate([{ name: 'commonName', value: 'Maoxuan local sync' }], {
      keySize: 2048,
      algorithm: 'sha256'
    })
    const temp = path + '.tmp'
    writeFileSync(
      temp,
      safeStorage.encryptString(JSON.stringify({ cert: pem.cert, private: pem.private })),
      { mode: 0o600 }
    )
    renameSync(temp, path)
    return pem
  }
}
