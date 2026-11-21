import type { JournalTemplate } from './journal'
export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    id: 'builtin-management-review',
    name: '每日总结 · 管理反思复盘',
    category: '每日复盘',
    markdown: `# 管理反思复盘模板｜一页极简版

---

## ① 今日三省（修己在先）

- 慎独：无人处是否松懈？
- 主敬：是否抓住要害？
- 求仁：是否怨人推责？

---

## ② 关键事实（只写看到的）

- 发生了什么？
- 涉及谁？
- 可被验证的事实是？

---

## ③ 目标 vs 结果

- 原定目标：
- 实际结果：
- 偏差一句话：

---

## ④ 核心过失（只选一个）

- 判断 / 能力 / 方法 / 心态
- 我具体错在：

---

## ⑤ 主要矛盾（毛选）

- 冲突双方：
- 谁是主要方面：
- 是否判断滞后：

---

## ⑥ 纠正动作（明天就做）

- 下次具体改法：
- 验证标准：

---

## ⑦ 一句话结论（沉淀认知）

- 本次真正学到的是：

---
`
  },
  {
    id: 'builtin-project-progress',
    name: '项目进展记录',
    category: '项目工作',
    markdown: `# 项目进展记录\n\n## 当前目标\n\n- 本阶段要达成什么：\n\n## 已完成\n\n- 今天推进了什么：\n- 可验证的结果：\n\n## 阻碍与协作\n\n- 当前阻碍：\n- 需要谁的支持：\n\n## 下一步\n\n- 具体行动：\n- 完成时间：\n`
  },
  {
    id: 'builtin-reading-insight',
    name: '阅读与实践',
    category: '学习思考',
    markdown: `# 阅读与实践\n\n## 今天读了什么\n\n- 书目 / 章节：\n\n## 最有启发的观点\n\n- 用自己的话复述：\n\n## 联系实际\n\n- 对应我遇到的什么问题：\n\n## 付诸行动\n\n- 准备如何尝试：\n- 如何验证效果：\n`
  }
]
