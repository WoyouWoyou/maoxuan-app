import {
  createJournalService,
  type JournalRepository,
  type JournalAssets
} from '@shared/engine/journal'
export { createJournalService } from '@shared/engine/journal'
export type { JournalRepository, JournalAssets } from '@shared/engine/journal'
let service: ReturnType<typeof createJournalService>
export function configureJournal(
  repo: JournalRepository,
  assets: JournalAssets,
  reward: (id: string, date: string) => void | boolean
) {
  service = createJournalService(repo, assets, reward)
}
export function journalService() {
  if (!service) throw new Error('日常记录尚未初始化')
  return service
}
