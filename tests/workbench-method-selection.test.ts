import { describe, expect, it } from 'vitest'
import { applyWorkbenchCommands } from '../src/main/modules/workbench/commands'
import { workbenchCommands } from '../src/shared/contracts/workbench'
import { emptyWorkbench, type WbContradiction, type WbObjSubj } from '../src/shared/types'
import {
  selectedWorkbench,
  wbStepUnlocked,
  wbStepDone,
  ruleChecksDecision
} from '../src/shared/workbench'
import {
  buildWbDecideUser,
  WB_INTAKE_SYSTEM,
  WB_DECIDE_SYSTEM
} from '../src/main/modules/workbench/prompts'
import { formSchema, intakeSchema } from '../src/shared/contracts/state-schema'

function fixture() {
  const wb = emptyWorkbench('推广 AI')
  wb.diagnosis.contradiction = {
    all: ['安装困难', '缺乏动力'],
    primary: '安装困难',
    mainAspect: '',
    secondaryAspect: '',
    why: '',
    turningConditions: [],
    focus: '先修适配',
    defer: ['全面推广'],
    factRefs: [],
    missingFacts: [],
    generatedAt: '',
    edited: false
  } as WbContradiction
  wb.diagnosis.objSubj = { biggestGap: '旧分析不应混入' } as WbObjSubj
  return wb
}

describe('按问题选择诊断方法', () => {
  it('旧项目即使已有结果也必须先确认方法', () => {
    const wb = fixture()
    expect(wbStepUnlocked(wb, 'wb_decide').ok).toBe(false)
    expect(wbStepDone(wb, 'wb_diagnose')).toBe(false)
  })
  it('单选完成即可综合，多选必须完成所选方法', () => {
    const wb = fixture()
    wb.form.diagnosisMethods = ['contradiction']
    expect(wbStepUnlocked(wb, 'wb_decide').ok).toBe(true)
    expect(wbStepDone(wb, 'wb_diagnose')).toBe(true)
    wb.form.diagnosisMethods = ['contradiction', 'routes']
    expect(wbStepUnlocked(wb, 'wb_decide').ok).toBe(false)
  })
  it('综合提示词和硬规则不会引用未选方法的历史结果', () => {
    const wb = fixture()
    wb.form.diagnosisMethods = ['contradiction']
    expect(selectedWorkbench(wb).diagnosis.objSubj).toBeNull()
    expect(wb.diagnosis.objSubj).not.toBeNull()
    expect(buildWbDecideUser(wb, [])).not.toContain('旧分析不应混入')
    expect(ruleChecksDecision(wb).some((c) => c.area === 'objSubj')).toBe(false)
  })
  it('存储兼容旧表单，并校验新的方法取值', () => {
    const wb = fixture()
    expect(() => formSchema(wb.form, 'form')).not.toThrow()
    expect(() => formSchema({ ...wb.form, diagnosisMethods: ['invalid'] }, 'form')).toThrow()
    expect(() =>
      intakeSchema(
        {
          facts: [],
          questions: [],
          missing: [],
          mainline: '',
          sideGoals: [],
          generatedAt: '',
          recommendation: { method: 'objSubj', reason: '先判断资源和执行条件' }
        },
        'intake'
      )
    ).not.toThrow()
  })
  it('方法确认通过命令持久化，更换方法清除旧决策', () => {
    const wb = emptyWorkbench('推广 AI')
    const next = { ...wb, form: { ...wb.form, diagnosisMethods: ['objSubj'] as import('../src/shared/types').WbMethod[] } }
    const saved = applyWorkbenchCommands(wb, workbenchCommands(wb, next))
    expect(saved.form.diagnosisMethods).toEqual(['objSubj'])
    // 已有结论在更换方法后不再作为可确认决策。
    saved.decision = { confirmed: true } as import('../src/shared/types').WbDecision
    const changed = applyWorkbenchCommands(saved, [{ kind: 'form', value: { ...saved.form, diagnosisMethods: ['routes'] } }])
    expect(changed.decision).toBeNull()
    expect(changed.form.diagnosisMethods).toEqual(['routes'])
  })
  it('AI 在整理问题时只推荐一种方法，综合不强制补齐三种', () => {
    expect(WB_INTAKE_SYSTEM).toContain('只推荐一个方法')
    expect(WB_DECIDE_SYSTEM).toContain('不得要求补齐')
  })
})
