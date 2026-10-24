import { validateIpcArguments } from '@shared/contracts/ipc'
import { ipcMain } from 'electron'
export function toError(error: unknown): Error {
  if (error instanceof Error) return new Error(error.message)
  return new Error(String(error))
}

export function register<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<TResult> => {
    try {
      validateIpcArguments(channel, args)
      return await handler(...(args as TArgs))
    } catch (error) {
      throw toError(error)
    }
  })
}
