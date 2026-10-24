import {
  emptyWorkbench,
  SESSION_DATA_VERSION,
  type WorkbenchData,
  type WbForm,
  type WbDiagnosis,
  type SessionData
} from '@shared/types'
import { assertSessionData } from '@shared/contracts/state-schema'
export const SESSION_SCHEMA_VERSION = SESSION_DATA_VERSION
/** 工作台数据结构的历史版本可能缺字段，这里统一补齐默认值。 */
function normalizeWorkbench(raw: WorkbenchData): WorkbenchData {
  const base = emptyWorkbench()
  const form = (raw.form ?? {}) as Partial<WbForm>
  const blockers = Array.isArray(form.blockers)
    ? form.blockers.map((item) => (typeof item === 'string' ? item : ''))
    : []
  while (blockers.length < 3) blockers.push('')

  const diagnosis = (raw.diagnosis ?? {}) as Partial<WbDiagnosis>
  const decision = raw.decision ? { ...raw.decision, checks: raw.decision.checks ?? [] } : null
  const actions = Array.isArray(raw.actions) ? raw.actions : []

  return {
    form: {
      projectName: form.projectName ?? base.form.projectName,
      objective: form.objective ?? base.form.objective,
      timeScale: form.timeScale ?? base.form.timeScale,
      stage: form.stage ?? base.form.stage,
      blockers,
      background: form.background ?? base.form.background,
      knownFacts: form.knownFacts ?? base.form.knownFacts,
      opponents: form.opponents ?? base.form.opponents,
      allies: form.allies ?? base.form.allies,
      swing: form.swing ?? base.form.swing
    },
    intake: raw.intake ?? null,
    diagnosis: {
      contradiction: diagnosis.contradiction ?? null,
      routes: diagnosis.routes ?? null,
      objSubj: diagnosis.objSubj ?? null
    },
    decision,
    actions: actions.map((action) => ({ ...action, progress: action.progress ?? [] })),
    actionChecks: raw.actionChecks ?? [],
    ledger: raw.ledger ?? []
  }
}

function migrateLegacy(data: SessionData): SessionData {
  data.readings = (data.readings ?? []).map((r) => ({ ...r, reflections: r.reflections ?? [] }))
  data.actions = (data.actions ?? []).map((a) => ({ ...a, progress: a.progress ?? [] }))
  if (data.workbench) data.workbench = normalizeWorkbench(data.workbench)
  data.book ??= {
    bookId: 'maoxuan',
    revisionId: 'maoxuan-v1',
    title: '毛泽东选集',
    profile: 'maoxuan',
    profileVersion: '1'
  }
  return data
}

/** Versioned independently of the database. Also used for historical snapshots. */
export function decodeSessionData(value: string | SessionData): SessionData {
  const data = typeof value === 'string' ? JSON.parse(value) : structuredClone(value)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('会话数据无效')
  let version = data.schemaVersion ?? 0
  if (!Number.isInteger(version) || version < 0 || version > SESSION_SCHEMA_VERSION)
    throw new Error('会话数据版本不受支持，请升级应用')
  if (version === 0) {
    migrateLegacy(data)
    data.schemaVersion = version = 1
  }
  if (version === 1) {
    const normalizeSources = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(normalizeSources)
        return
      }
      const record = value as Record<string, unknown>
      if (record.source && typeof record.source === 'object') {
        const source = record.source as Record<string, unknown>
        record.source = {
          bookId: source.bookId,
          revisionId: source.revisionId,
          chapterId: source.chapterId,
          paragraphId: source.paragraphId
        }
      }
      Object.values(record).forEach(normalizeSources)
    }
    normalizeSources(data)
    if (data.book?.profile === 'generic') {
      for (const result of [data.diagnosis, data.mindset]) {
        if (result)
          result.analysis ??= { obstacle: result.mainContradiction, constraints: result.stage }
      }
    }
    data.schemaVersion = version = 2
  }
  if (version === 2) {
    // 旧版没有纳入状态：升级一律按“已纳入”保留，避免清掉用户正在积累的待办。
    for (const action of data.workbench?.actions ?? []) action.planningState ??= 'queued'
    data.schemaVersion = version = 3
  }
  assertSessionData(data)
  return data
}
