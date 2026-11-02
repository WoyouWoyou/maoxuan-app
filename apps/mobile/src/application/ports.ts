import type { Entity, Snapshot } from '../domain/models'
export interface Commit {
  entity: Entity
  expectedVersion: number
  operationId: string
}
export interface AtomicStore {
  batch(commands: Commit[]): Promise<void>
  snapshot(): Promise<Snapshot>
  commit(command: Commit): Promise<void>
  // One atomic replacement, after validation; never a partial restore.
  restore(snapshot: Snapshot): Promise<void>
}
