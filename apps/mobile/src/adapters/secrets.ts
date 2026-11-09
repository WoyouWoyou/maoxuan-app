import { Capacitor } from '@capacitor/core'
export interface SecretStore {
  get(key: string): Promise<string>
  set(key: string, value: string): Promise<void>
}
export async function createSecrets(): Promise<SecretStore | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  return {
    get: async (key) => String((await SecureStorage.get(key)) ?? ''),
    set: async (key, value) => {
      await SecureStorage.set(key, value)
    }
  }
}
