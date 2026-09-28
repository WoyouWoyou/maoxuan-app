# 渲染进程共享约定（三个渲染任务并行编写，必须一致）

- 直接使用 `window.api`（类型来自 `src/preload/index.d.ts`，全局已声明），不要另建 api 封装。
- 全部使用**具名导出**：`export function Xxx(...)`。组件不要显式标注返回类型（React 19 已移除全局 `JSX` 命名空间，下文签名里的 `JSX.Element` 仅示意）。
- `tsconfig` 使用 `jsx: react-jsx`，无需 `import React`；需要类型时 `import type { ReactNode } from 'react'`。
- 会话列表刷新：任何创建 / 更新 / 删除会话后，调用 `window.dispatchEvent(new Event('sessions-changed'))`；`Sidebar` 监听此事件重新拉取列表。
- 路由（HashRouter）：`/` 首页、`/session/:id` 会话页（可带 `?focus=<articleId>`）、`/library` 书库、`/library/:articleId` 阅读页、`/settings` 设置。
- 每个组件的专属样式写在同目录同名 `.css` 文件并在组件内 `import './Xxx.css'`；类名加组件前缀避免冲突（如 `.chat-...`、`.ver-...`、`.step-...`、`.reader-...`）。
- 全局 `styles.css`（由外壳任务编写）提供以下 CSS 变量与基础类，其他任务直接使用：
  - 变量：`--paper #f6f1e7`、`--paper-2 #efe7d8`（卡片/侧栏底色）、`--ink #2b2b2b`、`--red #b8322a`、`--red-soft #f5e1dc`、`--muted #8a7f6d`、`--line #e2d9c8`、`--ok #3f7d4e`、`--serif`、`--sans`、`--radius 6px`
  - 按钮：`.btn`、`.btn-primary`（朱红底白字）、`.btn-ghost`（透明底边框）、`.btn-sm`、`.btn-danger`；`button:disabled` 半透明
  - 表单：`.input`、`.textarea`（宽 100%，自适应主题）、`.field`（容器）> `.field-label` + `.field-hint`
  - 容器：`.card`（纸色卡片，细边框，内边距 16px）、`.card-title`
  - 文字：`.muted`、`.serif`、`.error-text`（红色小字）、`.ok-text`
  - 徽标：`.badge`、`.badge-red`、`.badge-ok`
  - 布局工具：`.row`（flex 横向 gap 8px 居中）、`.col`（flex 纵向 gap 8px）、`.spacer`（flex:1）、`.scroll`（overflow:auto）
  - 加载：`.spinner`（14px 旋转圆圈，inline-block）
  - 空态：`.empty`（居中、muted、上下留白）
- 共享组件 props（由不同任务实现，彼此 import）：

```ts
// src/renderer/src/components/ArticleReader.tsx  (外壳任务实现)
export interface ArticleReaderProps {
  article: Article
  passages?: Passage[]            // 需高亮的段落（按 paragraphIndex）
  focusQuestion?: string          // 顶部显示“带着这个问题读”
  scrollToParagraph?: number | null  // 变化时平滑滚动到该段并闪烁高亮
  compact?: boolean               // 嵌入会话页时为 true：不显示卷名大标题
}
export function ArticleReader(props: ArticleReaderProps): JSX.Element

// src/renderer/src/components/ChatPanel.tsx  (侧栏任务实现)
export function ChatPanel(props: { sessionId: string; articleId: string | null }): JSX.Element

// src/renderer/src/components/VersionPanel.tsx  (侧栏任务实现)
export function VersionPanel(props: {
  sessionId: string
  currentData: SessionData
  versionNo: number               // 变化时重新拉取版本列表
  onRestored: (s: Session) => void
}): JSX.Element

// src/renderer/src/pages/SessionPage.tsx  (会话任务实现)
export function SessionPage(): JSX.Element
```

- 会话页步骤组件统一 props（会话任务内部使用）：

```ts
export interface StepProps {
  session: Session
  /** 保存 data；给 versionLabel 则记录版本；给 step 则同时切换 currentStep */
  save: (data: SessionData, opts?: { versionLabel?: string; step?: StepKey }) => Promise<void>
  goStep: (step: StepKey) => void
  /** 打开阅读器：切到第二步、选中文章、滚动到段落 */
  openReader: (articleId: string, paragraph?: number) => void
  focusArticleId: string | null
  setFocusArticleId: (id: string | null) => void
  scrollToParagraph: number | null
}
```
