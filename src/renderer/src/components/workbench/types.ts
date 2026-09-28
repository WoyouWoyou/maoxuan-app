import type { Session, WbStepKey, WorkbenchData } from '@shared/types'
import type { WbSourceArea } from '@shared/workbench'

export interface WbSaveOpts {
  /** 给了才写版本快照 */
  versionLabel?: string
  /** 同时推进 currentStep */
  step?: WbStepKey
}

export interface WbStepProps {
  session: Session
  /** 当前 workbench 数据（= session.data.workbench，已保证存在） */
  wb: WorkbenchData
  /**
   * 基于“最新的” workbench 计算新值再保存，走串行写入队列。
   * AI 调用前先 await 一次（把表单草稿写进库），AI 返回后再用它写回结果，避免覆盖期间的其他改动。
   */
  updateWb: (fn: (latest: WorkbenchData) => WorkbenchData, opts?: WbSaveOpts) => Promise<void>
  goStep: (step: WbStepKey) => void
  /** 打开右侧抽屉，显示该模块对应的原文依据 */
  openSource: (area: WbSourceArea) => void
}

export function toMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
}
