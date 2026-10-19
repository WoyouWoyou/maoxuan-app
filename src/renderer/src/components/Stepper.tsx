import type { SessionData, StepKey } from '@shared/types'
import { readingPresentation } from '@shared/reading-presentation'
import { STEPS } from '@shared/types'
import { stepDone, stepUnlocked } from './steps/types'

export interface StepperProps {
  currentStep: StepKey
  viewStep: StepKey
  data: SessionData
  onSelect: (step: StepKey) => void
}

export function Stepper({ currentStep, viewStep, data, onSelect }: StepperProps) {
  return (
    <div className="stepper">
      {STEPS.map((step) => {
        const unlocked = stepUnlocked(data, step.key)
        const done = stepDone(data, step.key)
        const classes = ['stepper-item']
        if (step.key === viewStep) classes.push('is-active')
        if (done) classes.push('is-done')
        if (!unlocked.ok) classes.push('is-locked')
        if (step.key === currentStep) classes.push('is-current')
        return (
          <button
            key={step.key}
            type="button"
            className={classes.join(' ')}
            disabled={!unlocked.ok}
            title={
              unlocked.ok
                ? (readingPresentation(data).hints?.[step.no - 1] ?? step.hint)
                : unlocked.reason
            }
            onClick={() => onSelect(step.key)}
          >
            <span className="stepper-no">{done ? '✓' : step.no}</span>
            <span className="stepper-body">
              <span className="stepper-name">{step.name}</span>
              <span className="stepper-hint">
                {readingPresentation(data).hints?.[step.no - 1] ?? step.hint}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
