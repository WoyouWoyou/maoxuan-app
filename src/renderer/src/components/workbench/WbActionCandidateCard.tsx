import type { ReactNode } from 'react'
import type { WbAction } from '@shared/types'
import { WB_HORIZONS, WB_STANDARDS } from '@shared/workbench'

export interface WbActionCandidateCardProps {
  action: WbAction
  checked: boolean
  disabled: boolean
  editing: boolean
  onCheck(next: boolean): void
  onEdit(): void
  form?: ReactNode
}

function standardLabel(value: string): string {
  return WB_STANDARDS.find((s) => s.name === value)?.name ?? value
}

function standardHint(value: string): string {
  return WB_STANDARDS.find((s) => s.name === value)?.hint ?? ''
}

function CandidateField({ label, text }: { label: string; text: string }) {
  return (
    <div className="wbx-field">
      <div className="wbx-field-label">{label}</div>
      <div className="wbx-field-text">{text || '—'}</div>
    </div>
  )
}

/** 候选策略卡：只有筛选与编辑，不提供完成 / 放弃 / 阶段进展。 */
export function WbActionCandidateCard({
  action,
  checked,
  disabled,
  editing,
  onCheck,
  onEdit,
  form
}: WbActionCandidateCardProps) {
  const horizon = WB_HORIZONS.find((h) => h.key === action.horizon)
  const horizonName = horizon ? horizon.name.replace('动作', '').trim() : action.horizon
  const standards = action.standards ?? []

  return (
    <div className={checked ? 'wbx-candidate is-checked' : 'wbx-candidate'}>
      <label className="wbx-candidate-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || editing}
          aria-label={`选择候选策略：${action.action}`}
          onChange={(e) => onCheck(e.target.checked)}
        />
      </label>

      <div className="wbx-candidate-main">
        {editing ? (
          (form ?? null)
        ) : (
          <>
            <div className="wbx-candidate-head">
              <span className="wbx-action-title">{action.action || '未命名策略'}</span>
              <span className="badge">{horizonName}</span>
            </div>

            <div className="wbx-action-fields">
              <CandidateField label="目的" text={action.purpose} />
              <CandidateField label="验证" text={action.verify} />
            </div>

            <details className="wbx-candidate-details">
              <summary>展开详情</summary>
              <div className="wbx-candidate-detail-body">
                <CandidateField label="与 KPI 的关系" text={action.kpi} />
                {standards.length > 0 ? (
                  <div className="wbx-field">
                    <div className="wbx-field-label">毛选执行标准</div>
                    <div className="wbx-std-chips">
                      {standards.map((s) => (
                        <span className="wbx-std" key={s} title={standardHint(s)}>
                          {standardLabel(s)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="wbx-hint">还没有挂毛选执行标准</div>
                )}
              </div>
            </details>

            <div className="wbx-candidate-btns">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={disabled}
                aria-label={`编辑候选策略：${action.action}`}
                onClick={onEdit}
              >
                编辑
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
