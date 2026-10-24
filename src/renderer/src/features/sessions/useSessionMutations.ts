import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type {
  Session,
  SessionData,
  SessionMetadataPatch,
  StepKey,
  WorkbenchData
} from '@shared/types'
import { readingCommands, type ReadingCommand } from '@shared/contracts/reading'
import { workbenchCommands, type WorkbenchCommand } from '@shared/contracts/workbench'
type Options = { versionLabel?: string; step?: StepKey }
/** One queue per mounted session; commands are computed against the latest accepted server state. */
export function useSessionMutations(
  id: string,
  latest: RefObject<Session | null>,
  onApplied: (s: Session) => void
) {
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => {
    queue.current = Promise.resolve()
  }, [id])
  const enqueue = useCallback(
    (
      work: (s: Session, mutationId: string) => Promise<Session>,
      explicitMutationId?: string
    ): Promise<Session> => {
      // 响应丢失后的重试复用原 mutationId，避免重复写入。
      const mutationId = explicitMutationId ?? crypto.randomUUID()
      const run = queue.current.then(async () => {
        const current = latest.current
        if (!current || current.id !== id) throw new Error('问题已切换，本次修改未保存')
        const updated = await work(current, mutationId)
        if (latest.current?.id === id) {
          latest.current = updated
          onApplied(updated)
        }
        window.dispatchEvent(new Event('sessions-changed'))
        return updated
      })
      queue.current = run.catch(() => undefined)
      return run
    },
    [id, latest, onApplied]
  )
  const metadata = useCallback(
    (patch: SessionMetadataPatch, label?: string) =>
      enqueue((s, mutationId) =>
        window.api.sessions.update(
          id,
          { ...patch, expectedStateVersion: s.stateVersion, mutationId },
          label
        )
      ),
    [id, enqueue]
  )
  const applyReading = useCallback(
    (commands: ReadingCommand[], opts?: Options) =>
      enqueue((s, mutationId) =>
        window.api.reading.apply(
          id,
          commands,
          s.stateVersion ?? 0,
          opts?.versionLabel,
          opts?.step,
          mutationId
        )
      ),
    [id, enqueue]
  )
  const reading = useCallback(
    (change: (data: SessionData) => SessionData, opts?: Options) =>
      enqueue((s, mutationId) =>
        window.api.reading.apply(
          id,
          readingCommands(s.data, change(structuredClone(s.data))),
          s.stateVersion ?? 0,
          opts?.versionLabel,
          opts?.step,
          mutationId
        )
      ),
    [id, enqueue]
  )
  const workbench = useCallback(
    (change: (data: WorkbenchData) => WorkbenchData, opts?: Options) =>
      enqueue((s, mutationId) => {
        if (!s.data.workbench) throw new Error('缺少工作台数据')
        return window.api.wb.apply(
          id,
          workbenchCommands(s.data.workbench, change(structuredClone(s.data.workbench))),
          s.stateVersion ?? 0,
          opts?.versionLabel,
          opts?.step,
          mutationId
        )
      }),
    [id, enqueue]
  )
  const applyWorkbench = useCallback(
    (commands: WorkbenchCommand[], opts?: Options & { mutationId?: string }) =>
      enqueue(
        (s, mutationId) =>
          window.api.wb.apply(
            id,
            commands,
            s.stateVersion ?? 0,
            opts?.versionLabel,
            opts?.step,
            mutationId
          ),
        opts?.mutationId
      ),
    [id, enqueue]
  )
  return { metadata, applyReading, applyWorkbench, reading, workbench }
}
