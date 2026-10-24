import type { SpeechRequest } from '@shared/contracts/reader'

interface PrefetchClient {
  prefetch(request: SpeechRequest): Promise<void>
  cancel(id: string): Promise<void>
}
/** One sequential background worker; playback has its own foreground lane. */
export function prefetchSpeech(
  texts: string[],
  voice: string,
  client: PrefetchClient,
  options: { skip?(index: number): boolean; ready?(index: number): void; failed?(): void } = {}
) {
  let stopped = false
  let activeId: string | undefined
  const done = (async () => {
    for (let index = 0; index < texts.length; index++) {
      if (stopped) break
      if (options.skip?.(index)) continue
      const id = crypto.randomUUID()
      activeId = id
      try {
        await client.prefetch({ id, text: texts[index], voice })
        if (!stopped) options.ready?.(index)
      } catch {
        // A background miss must not interrupt the current paragraph; foreground can retry.
        if (!stopped) options.failed?.()
      } finally {
        if (activeId === id) activeId = undefined
      }
    }
  })()
  return {
    done,
    stop() {
      stopped = true
      if (activeId) {
        void client.cancel(activeId).catch(() => {})
        activeId = undefined
      }
    }
  }
}
