# 毛选实用工具箱 — 产品与技术规格

把“带着问题读《毛选》”的四步阅读法做成桌面应用。读的标准不是“看懂原文”，而是“能用在自己身上”。
口诀：**拿出最头疼的问题 → 找到对应文章 → 读三步 → 写 3 条 → 干 1 件事**。

## 1. 方法论 → 产品流程（每一步的输入 / 输出）

| 步骤 | 用户输入 | AI 做什么 | 输出（写入 SessionData） | 进入下一步的门槛 |
|---|---|---|---|---|
| 1 明确问题 | `problem.text` 最头疼的一件事（必填，≥10 字）、`background` 背景、`tried` 已试过的办法 | 复述问题、识别症状、判断主要矛盾与所处阶段、从核心五篇中推荐 1–3 篇 | `diagnosis` | 必须有问题文本且已诊断。**没有问题，就不要翻开《毛选》** |
| 2 聚焦核心 | 选择一篇文章（默认推荐篇，也可从核心五篇 / 全书选） | 只“指路”不“解读”：给出一个带着问题去读的引导问题 + 3–6 段原文段落位置和原句（原句必须是原文子串，程序校验） | `readings[i].focusQuestion / passages / readDone` | 至少一篇 `readDone = true` |
| 3 联系自身 | 3 条笔记：核心方法（一句话、自己的话）、关联问题（对应我哪个具体问题）、具体行动（明天就能做的动作） | 批改而不代写：逐条 0–5 分打分，指出空泛之处；不及格时列出应重读的段落。**写不出来，说明没读懂** | `readings[i].notes / feedback / notesDone`，并把第 3 条自动加入 `actions`（截止日默认明天） | 至少一篇 `notesDone = true` |
| 4 反复应用 | 勾选行动完成情况并写结果；遇到新难题时记录“新情况” | 针对新情况推荐该重读哪几篇（可含非核心篇）；生成“最终心法”三问的答案 | `actions[].status/result`、`reviews[]`、`mindset` | 循环：新难题 → 回到第 2 步重读 |

### 核心五篇（程序中 `isCore = true`，`coreOrder` 0–4）

| coreOrder | 文章 | articleId | 解决的核心问题 |
|---|---|---|---|
| 0 | 实践论 | Section0215 | 想得多、做得少，主观臆断 |
| 1 | 矛盾论 | Section0216 | 局面一团乱麻，抓不住重点 |
| 2 | 论持久战 | Section0309 | 急于求成，看不到希望，想放弃 |
| 3 | 反对本本主义 | Section0205 | 照搬别人经验，不结合自身实际 |
| 4 | 中国革命战争的战略问题 | Section0211 | 在竞争中处于弱势，如何以弱胜强 |

`src/shared/core.ts` 已包含上表（`CORE_ARTICLES`），以及 `FOUR_DONTS`（四不要）、`NOTE_EXAMPLE`（论持久战 · 负债 30 万示例）、`MINDSET_QUESTIONS`（三问）。

### 四不要（在界面中作为常驻提示）
不要追求形式 / 不要贪多求全 / 不要依赖解读 / 不要陷入争论。
其中“不要依赖解读”是 AI 行为约束：**AI 不得替用户总结文章、不得代写笔记，只能指原文、提问、批改**。

### 最终心法三问
主要矛盾是什么？我现在在哪个阶段？第一步该干什么？

## 2. 技术栈（已安装，勿改 package.json）

- Electron 44 + electron-vite 5 + Vite 7，TypeScript 5.9 strict
- 渲染进程：React 19 + react-router-dom 7（使用 `HashRouter`/`Routes`/`Route`/`useNavigate`/`useParams`，与 v6 API 一致）+ react-markdown 10
- 主进程：better-sqlite3（同步 API）、dotenv、Node 内置 `fetch`、`crypto.randomUUID()`
- 样式：纯 CSS（`src/renderer/src/styles.css`），不引入 UI 库 / Tailwind
- 路径别名：`@shared/*` → `src/shared/*`，`@renderer/*` → `src/renderer/src/*`
- 原文数据：`resources/articles.json`，数组 `{id,title,volume,isCore,coreOrder,content}`，396 篇，`content` 以 `\n` 分段

## 3. 目录结构

```
src/shared/types.ts        (已写好，契约，勿改)
src/shared/api.ts          (已写好，window.api 接口，勿改)
src/shared/core.ts         (已写好，核心五篇等常量)
src/main/index.ts          BrowserWindow、加载 .env、初始化 DB、注册 IPC
src/main/db.ts             SQLite schema + 仓储函数
src/main/articles.ts       载入 articles.json、段落切分、FTS 检索
src/main/ai.ts             DeepSeek 客户端（JSON 调用 + 流式调用）
src/main/prompts.ts        各步骤 system prompt 与消息构造
src/main/ipc.ts            注册所有 ipcMain.handle
src/preload/index.ts       contextBridge.exposeInMainWorld('api', ...)
src/preload/index.d.ts     declare global { interface Window { api: MaoxuanApi } }
src/renderer/index.html
src/renderer/src/main.tsx, App.tsx, styles.css
src/renderer/src/components/...
src/renderer/src/pages/...
```

## 4. 主进程细节

### 4.1 数据库（`app.getPath('userData')/maoxuan.db`，WAL 模式）

```sql
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, current_step TEXT NOT NULL DEFAULT 'problem',
  status TEXT NOT NULL DEFAULT 'active', data TEXT NOT NULL, version_no INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL, step TEXT NOT NULL, label TEXT NOT NULL, data TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(session_id, version_no));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, article_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, volume TEXT NOT NULL, is_core INTEGER NOT NULL,
  core_order INTEGER, content TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(title, content, content='articles', content_rowid='rowid', tokenize='trigram');
```

- `PRAGMA foreign_keys = ON`。
- 启动时若 `articles` 为空，从 `articles.json` 批量导入（事务）并 `INSERT INTO articles_fts(articles_fts) VALUES('rebuild')`。
  - 路径：`app.isPackaged ? path.join(process.resourcesPath, 'articles.json') : path.join(app.getAppPath(), 'resources', 'articles.json')`。
  - 导入时去掉 `content` 开头孤立的 `*` 行。
- `sessions.create(problemText)`：`title` 取问题前 24 字；`data = emptySessionData()` 并填入 `problem.text`；写入 **v1**，label `创建问题`。
- `sessions.update(id, patch, versionLabel?)`：合并 patch，`updated_at = now`；若给了 `versionLabel`，`version_no += 1` 并在 `versions` 插入完整 `data` 快照（`step` = 更新后的 `current_step`）。同一事务。
- `versions.restore(versionId)`：把该版本 `data` 和 `step` 写回 session，并新增一个版本，label `恢复自 v{n}`。
- 列表按 `updated_at DESC`。时间一律 ISO 字符串。
- 设置项键：`apiKey`、`baseUrl`、`model`。读取时若 DB 无值，回退 `process.env.DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL`，再回退默认 `https://api.deepseek.com/v1`、`deepseek-v4-flash`。

### 4.2 原文与检索（`articles.ts`）
- `paragraphs = content.split('\n').map(s=>s.trim()).filter(Boolean)`；`paragraphIndex` 均指这个数组下标（0 起）。
- `search(query, limit=30)`：去空白；长度 ≥3 用 FTS5 `MATCH`（把 query 用双引号包裹并转义内部双引号），`snippet(articles_fts, 1, '【', '】', '…', 24)`，按 `bm25` 排序；长度 <3 用 `LIKE`，手工截取命中位置前后 40 字作为 snippet 并用【】标出。标题命中排前。
- 内存缓存 `Map<id, Article>`。

### 4.3 AI（`ai.ts` + `prompts.ts`）
- 端点：`${baseUrl}/chat/completions`（baseUrl 去掉末尾 `/`），`Authorization: Bearer ${apiKey}`。
- 该模型是推理模型，响应里可能有 `reasoning_content`，**只取 `content`**；`max_tokens` 设为 8192（JSON 调用）/ 4096（聊天）。
- `callJson<T>(system, user)`：`response_format: {type:'json_object'}`，`temperature: 0.3`；解析失败时尝试从文本中截取第一个 `{` 到最后一个 `}` 再解析；仍失败抛错 `AI 返回的不是合法 JSON`。超时 120s（AbortController）。未配置 apiKey 时抛错 `请先在设置中填写 DeepSeek API Key`。
- `streamChat(messages, onDelta)`：`stream: true`，按 SSE 解析 `data:` 行，`[DONE]` 结束，只累积 `choices[0].delta.content`。
- 所有 system prompt 共同前缀（`BASE_RULES`）：你是“《毛选》实用阅读教练”；读的标准是能用在自己身上；严格遵守四不要，尤其**不替用户总结文章、不代写笔记、不纠结字句正确意思**；引用原文必须一字不差；回答用中文，具体、落地、简短。
- 各调用（输入 → 输出 JSON 键，与 `types.ts` 一致）：
  1. `diagnose`：输入 problem 三字段 + 核心五篇表（id、标题、解决的问题）。输出 `Diagnosis`，`recommendations` 1–3 条，`articleId` 必须来自核心五篇，程序过滤非法 id 并用 CORE 表回填 `title`。
  2. `findPassages`：输入问题、诊断、目标文章带编号段落（`[12] 段落文字`；若全文 > 60000 字，只发送与问题关键词相关度高的段落 + 每章标题段落，保证不超过 60000 字）。输出 `{focusQuestion, passages:[{paragraphIndex, quote, why}]}` 3–6 条；`why` 只说明“为什么这段和你的问题有关”，不解读原文。程序校验：`quote` 是 `paragraphs[paragraphIndex]` 的子串 → `verified=true`；否则在全文段落中查找 quote 所在段落并修正下标；都找不到则 `quote` 替换为该段落前 80 字、`verified=false`。
  3. `reviewNotes`：输入问题、文章标题、该篇 passages、三条笔记、`NOTE_EXAMPLE` 作为及格样例。标准：核心方法是一句话、用自己的话、是方法不是史实；关联问题指向用户问题中的具体情形；具体行动是明天就能做、可验证的一个动作。输出 `NoteFeedback`，任一项 <3 分则 `passed=false`，`rereadParagraphs` 给段落下标。不得给出改写后的完整笔记。
  4. `reviewSituation`：输入原问题、已读篇目与笔记、行动完成情况、新情况。输出 `{rereadArticleIds, advice}`（可含非核心篇，但 id 必须存在于文章库；程序过滤），`advice` 用三问结构组织。程序补齐 `id`、`createdAt`、`newSituation`。
  5. `mindset`：输入全部 SessionData。输出 `{mainContradiction, stage, firstStep}`，程序补 `generatedAt`。
  6. 聊天：system = BASE_RULES + 当前会话摘要（问题、诊断、已读篇目、笔记、行动）；若带 `articleId`，附加该篇标题与已标注 passages 原文。历史取最近 20 条。助手消息完成后入库，并通过 `webContents.send('chat:chunk'|'chat:done'|'chat:error')` 推送。

### 4.4 IPC
通道名 `${group}:${method}`，例如 `sessions:update`。事件通道：`chat:chunk`、`chat:done`、`chat:error`。preload 中 `onChunk` 等返回取消订阅函数。handler 抛出的错误用 `new Error(中文消息)`。

## 5. 渲染进程 UI

整体风格：“纸质书 + 朱红批注”。米白纸色背景 `#f6f1e7`，正文墨色 `#2b2b2b`，强调色朱红 `#b8322a`，次要色 `#8a7f6d`；原文用宋体栈 `"Songti SC","STSong","Noto Serif SC",serif`，界面用 `-apple-system,"PingFang SC",sans-serif`。圆角 6px，细边框 `#e2d9c8`。窗口最小 1100×720。

布局：左侧栏 240px | 主区域自适应 | 右侧面板 360px（可折叠）。

- **左侧栏 `Sidebar`**：应用名；醒目按钮“＋ 我有一个头疼的问题”（新建会话，弹出输入框，必填）；会话列表（标题、当前步骤徽标、更新时间，右键/悬停可删除，需确认）；底部导航“原文书库”“设置”。
- **会话页 `/session/:id`**：顶部 `Stepper` 四步（显示序号、名称、hint；已完成打勾；可点击回看；未达门槛的步骤禁用并 tooltip 说明原因）。下方渲染当前步骤组件。页面底部常驻一条“四不要”提示轮播（`FOUR_DONTS`）。
  - `StepProblem`：三个 textarea（最头疼的一件事 / 背景 / 已经试过什么）；“请教练诊断”按钮（loading 状态）；诊断卡：复述、症状标签、主要矛盾、所处阶段、推荐篇目卡片（标题 + 理由 + 带着读的问题 + “去读原文”按钮）。“确认问题，进入第二步”→ `update(..., '第一步：明确问题')`。
  - `StepFocus`：左列可选文章（推荐篇在前，其余核心篇其次，底部“从全书搜索”）；右列 `ArticleReader`：宋体原文，段落编号，AI 标注段落高亮（朱红左边框 + 淡红底），点击侧边“标注列表”滚动到对应段落；顶部显示 focusQuestion；“帮我找到该读的段落”按钮；“我读完了，去写 3 条笔记”→ `readDone=true`，版本 label `第二步：精读《标题》`。
  - `StepRelate`：选择已读文章；三条笔记表单，每条带说明与示例占位（来自 `NOTE_EXAMPLE`）；“请教练批改”→ 显示分数条、意见、需重读段落（可点击跳到阅读器）；“保存笔记”（三条都非空才可用）→ `notesDone=true`、把第 3 条加入 actions，版本 label `第三步：《标题》3 条笔记`。
  - `StepApply`：行动清单（勾选完成/放弃，填写结果，逾期标红）；“遇到新难题”表单 → `reviewSituation` → 显示建议与重读篇目按钮（点击回到第二步并选中该篇）；复盘历史列表；“生成心法三问”卡片（三问大字展示）。每次操作都存版本（label 如 `第四步：完成行动`、`第四步：新情况复盘`、`第四步：心法三问`）。
- **右侧面板**（会话页内）两个 tab：
  - `ChatPanel`：与教练对话，Markdown 渲染，流式显示，发送时附带当前阅读中的 articleId；空态给出 3 个快捷提问（“我的主要矛盾是什么？”“我现在在哪个阶段？”“明天第一步该干什么？”）；可清空对话。
  - `VersionPanel`：版本时间线（vN、label、步骤、时间）；点击查看快照（只读，按字段展示）；“与当前对比”显示字段级差异（把 SessionData 扁平化为 `path → 值`，列出新增/删除/修改，修改项显示旧值与新值）；“恢复到此版本”（确认后调用 restore，刷新会话）。
- **原文书库 `/library`**：搜索框（防抖 300ms，显示命中 snippet，【】高亮）；未搜索时展示“核心五篇”卡片（含解决的问题）+ 按卷分组的目录（可折叠）；点击进入 `/library/:articleId` 阅读页（`ArticleReader`，无 AI 标注），顶部按钮“用它解决我的问题”→ 选择一个会话，加入 readings 并跳到该会话第二步。
- **设置 `/settings`**：API Key（password 输入，可显示）、Base URL、Model；保存；“测试连接”。
- 首页 `/`：若无会话，显示方法论说明（四步 + 口诀 + “现在就停止研究该怎么读”）和新建按钮；否则跳到最近会话。

### 5.1 v0.2 新增
- **阅读感悟（第二步）**：阅读器下方常驻“阅读感悟”框。点击原文段落编号即把该段设为“关联段落”（段落高亮，感悟框显示“关联：第 N 段 · 前 40 字”，可取消关联）；写下感悟后保存为 `Reflection`（`quote` 取该段前 80 字）。下方按时间倒序列出本篇感悟，点“第 N 段”可跳回原文，可删除。保存感悟不记版本；点“我读完了”时一并进入版本快照。
- **第三步可见感悟**：选中文章后，3 条笔记表单上方显示本篇全部阅读感悟（只读卡片，可跳回原文），引导“先看自己的感悟，再写 3 条”。批改提示词与教练对话都要带上感悟。
- **第一步“套用讨论结果”**：用户对诊断有分歧时，在右侧与教练讨论；讨论后点“把讨论结果套用到第一步”（对话面板底部与诊断卡片上各一个入口）→ `ai.reviseProblem` 读取对话 + 当前问题与诊断，返回 `ProblemRevision`（完整的新 problem、新 diagnosis、以及 `changes` 改动说明）→ 弹窗逐字段展示“原 / 新”，默认勾选有变化的字段，用户确认后只套用勾选项，版本 label `第一步：根据讨论修订`。诊断卡片的复述、主要矛盾、阶段也支持直接手动编辑（版本 label `第一步：手动修订诊断`）。
- 第三步批改按钮文案为“请教员批改”。

状态管理：不引入库。会话页持有 `session` state，子组件通过 `onChange(data, versionLabel?)` 回调，父组件调用 `window.api.sessions.update` 并用返回值替换 state。所有 async 操作显示 loading 与错误信息（错误用内联红色提示，不用 alert）。
