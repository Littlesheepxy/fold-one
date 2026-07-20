# Fold Runtime — 技术架构文档

> Agent harness 的外部对标、事件事实源、durable interrupt 与副作用账本演进见
> [Agent Harness 架构对标与演进 RFC](./agent-harness-benchmark.md)。

---

## 1. 架构总览

```
                    Electron (Desktop Shell)
                           │
                    React + Tailwind (Overlay UI)
                           │
                      Fold Runtime
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    Context Engine    Orchestrator       Memory
         │                 │                 │
         │          ┌──────┼──────┐          │
         │          │      │      │          │
         │       Planner Executor Validator  │
         │          │      │      │          │
         └──────────┼──────┼──────┼──────────┘
                    │      │      │
              Action Router (Connector Layer)
                    │
    ┌───────┬───────┼───────┬──────────┐
    │       │       │       │          │
Playwright Shell AppleScript Accessibility UI-TARS
  (CDP)   (Python)  (macOS)    (AX)     (Vision)
```

### 1.1 设计原则

| 原则 | 说明 |
|------|------|
| 统一架构 | 一套 Runtime，不按场景拆多个系统 |
| 执行分级 | Tier 0 / 1 / 2 路由，用户无感知 |
| UI 与 Runtime 解耦 | Overlay 只订阅状态流 |
| Skill 插件化 | 能力抽象与 Connector 实现分离 |
| 快路径优先 | API > Script > AX > Vision |
| AI 只规划 | Executor 不调 LLM，Repair 按需启用 |

---

## 2. Monorepo 目录结构

```
fold/
├── apps/
│   ├── desktop/              # Electron + React + Vite（主应用）
│   │   ├── src/
│   │   │   ├── main/         # Electron main process
│   │   │   ├── overlay/     # Overlay UI
│   │   │   ├── menubar/     # Menu bar
│   │   │   └── settings/    # Settings window
│   │   └── package.json
│   └── web/                  # Next.js（后续：官网 / Marketplace / Dashboard）
│       └── package.json
├── packages/
│   ├── runtime/              # 核心 Runtime
│   │   ├── src/
│   │   │   ├── orchestrator/
│   │   │   ├── planner/
│   │   │   ├── executor/
│   │   │   ├── validator/
│   │   │   └── router/
│   │   └── package.json
│   ├── context/              # Context Engine
│   │   ├── src/
│   │   │   ├── collectors/   # 事件采集器
│   │   │   ├── store/        # Live Context 存储
│   │   │   └── types.ts
│   │   └── package.json
│   ├── skills/               # Skill 定义 + 内置 Skills
│   │   ├── src/
│   │   │   ├── registry.ts
│   │   │   ├── builtin/
│   │   │   │   ├── finder.ts
│   │   │   │   ├── pdf.ts
│   │   │   │   ├── mail.ts
│   │   │   │   └── browser.ts
│   │   │   └── types.ts
│   │   └── package.json
│   ├── connectors/           # 执行后端
│   │   ├── src/
│   │   │   ├── playwright/
│   │   │   ├── shell/
│   │   │   ├── applescript/
│   │   │   ├── accessibility/
│   │   │   └── uitars/
│   │   └── package.json
│   ├── memory/               # Episode + 长期 Memory
│   │   ├── src/
│   │   │   ├── episode.ts
│   │   │   ├── store.ts      # SQLite
│   │   │   └── types.ts
│   │   └── package.json
│   ├── repair/               # Repair Sub-agents
│   │   ├── src/
│   │   │   ├── browser-repair.ts
│   │   │   ├── mail-repair.ts
│   │   │   └── gui-repair.ts
│   │   └── package.json
│   ├── ui/                   # 共享 React 组件
│   └── sdk/                  # Skill 作者 SDK（后续）
├── docs/
│   ├── product.md
│   ├── ui.md
│   └── architecture.md
├── package.json              # Turborepo / pnpm workspace root
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 3. 核心模块

### 3.1 Context Engine

监听 macOS 系统事件，形成 Live Context。

#### 事件采集器

| Collector | 数据源 | 事件类型 | 实现 |
|-----------|--------|----------|------|
| `AppCollector` | NSWorkspace | `app.active`, `app.quit` | Electron `powerMonitor` + native addon |
| `FileCollector` | FSEvents | `file.created`, `file.modified` | `chokidar` 监听 Downloads/Desktop |
| `ClipboardCollector` | NSPasteboard | `clipboard.changed` | 轮询或 native observer |
| `BrowserCollector` | Chrome Extension / CDP | `browser.urlChanged`, `browser.titleChanged` | 浏览器扩展消息 |
| `MailCollector` | AppleScript | `mail.opened`, `mail.sent` | `osascript` 查询 |

#### Context Event 类型

```typescript
interface ContextEvent {
  id: string
  type:
    | 'app.active'
    | 'app.quit'
    | 'file.created'
    | 'file.modified'
    | 'clipboard.changed'
    | 'browser.urlChanged'
    | 'browser.titleChanged'
    | 'mail.opened'
    | 'mail.sent'
  source: 'finder' | 'chrome' | 'mail' | 'calendar' | 'system' | 'clipboard'
  timestamp: number
  data: {
    appName?: string
    windowTitle?: string
    filePath?: string
    url?: string
    text?: string
    [key: string]: unknown
  }
}
```

#### Live Context Store

```typescript
interface LiveContext {
  activeApp: string | null
  activeWindow: string | null
  recentFiles: Array<{ path: string; timestamp: number }>
  recentUrls: Array<{ url: string; title: string; timestamp: number }>
  clipboard: { text: string; timestamp: number } | null
  recentContacts: Array<{ name: string; source: string }>
  events: ContextEvent[]  // ring buffer, 30 min TTL
}
```

- 存储：内存 ring buffer + SQLite 持久化
- TTL：30 分钟自动过期
- 查询：按 type / source / time range 过滤

#### Event Engine（规则过滤）

```
OS Event → Rule Engine → 重要吗？
  重要 → 写入 Live Context
  不重要 → 丢弃
```

| 事件 | 重要性 |
|------|--------|
| 鼠标移动 | ✗ |
| 窗口大小变化 | ✗ |
| 打开 Chrome | ✓ |
| 下载 PDF | ✓ |
| Mail 发送 | ✓ |
| 复制 > 100 字 | ✓ |
| App 切换 | ✓ |

---

### 3.2 Orchestrator（主 Agent）

管理任务完整生命周期。

```typescript
interface Orchestrator {
  run(intent: string, context: LiveContext): Promise<TaskResult>
}

interface TaskResult {
  status: 'success' | 'partial' | 'failed'
  episode: Episode
  steps: StepResult[]
  error?: string
}
```

#### 执行流程

```typescript
async function run(intent: string, context: LiveContext): Promise<TaskResult> {
  // 1. 路由：选择执行层级
  const tier = router.resolve(intent, context)
  // tier: 'compiled' | 'plan' | 'react'

  // 2. 规划
  const plan = tier === 'compiled'
    ? compiledSkills.match(intent)
    : await planner.createPlan(intent, context)

  // 3. 执行
  const results = await executor.run(plan)

  // 4. 失败处理
  for (const failure of results.failures) {
    const recovery = await handleFailure(failure, plan, context)
    if (recovery.type === 'retry') await executor.retry(failure.step)
    if (recovery.type === 'replan') await executor.run(recovery.newStep)
    if (recovery.type === 'repair') await repairAgent.run(failure)
    if (recovery.type === 'ask') await ui.ask(recovery.options)
  }

  // 5. 校验
  const validation = await validator.check(plan, results)

  // 6. 记录
  const episode = await memory.saveEpisode(intent, plan, results)

  return { status: validation.ok ? 'success' : 'failed', episode, steps: results }
}
```

---

### 3.3 Planner

一次性输出结构化 ActionPlan，不做逐步推理。

```typescript
interface ActionPlan {
  goal: string
  steps: ActionStep[]
  validate: string[]  // 校验规则 ID
}

interface ActionStep {
  id: string
  skill: string           // e.g. "pdf.extract"
  args: Record<string, unknown>
  dependsOn?: string[]    // 可并行：无依赖的步骤同时执行
  retryable: boolean
  timeout: number         // ms
}
```

#### Planner Prompt 约束

- 只输出 JSON，不输出自然语言
- 只调用 `skills/registry` 中已注册的 Skill
- 优先使用 Live Context 中已有的实体（文件路径、联系人等）
- 不输出 GUI 操作指令（"点击"、"看屏幕"）
- 使用便宜/快速的模型（如 Claude Haiku / GPT-4o-mini）

#### 示例输出

```json
{
  "goal": "整理报价并创建邮件草稿",
  "steps": [
    {
      "id": "s1",
      "skill": "finder.latestDownload",
      "args": { "ext": "pdf", "since": "30m" },
      "retryable": true,
      "timeout": 3000
    },
    {
      "id": "s2",
      "skill": "pdf.extract",
      "args": { "fields": ["vendor", "amount", "date"] },
      "dependsOn": ["s1"],
      "retryable": false,
      "timeout": 5000
    },
    {
      "id": "s3",
      "skill": "mail.draft",
      "args": { "to": "Jason", "template": "quote-summary" },
      "dependsOn": ["s2"],
      "retryable": true,
      "timeout": 5000
    }
  ],
  "validate": ["pdf.fields.nonEmpty", "mail.draft.exists"]
}
```

---

### 3.4 Executor

纯代码执行，不调 LLM。

```typescript
interface Executor {
  run(plan: ActionPlan): Promise<ExecutionResult>
  retry(step: ActionStep): Promise<StepResult>
}

interface ExecutionResult {
  steps: StepResult[]
  failures: StepFailure[]
}

interface StepResult {
  stepId: string
  status: 'success' | 'failed' | 'skipped'
  output: unknown
  duration: number
}
```

#### 执行策略

```typescript
async function run(plan: ActionPlan): Promise<ExecutionResult> {
  const graph = buildDependencyGraph(plan.steps)
  const results: StepResult[] = []

  for (const batch of graph.topologicalBatches()) {
    // 无依赖关系的步骤并行执行
    const batchResults = await Promise.all(
      batch.map(step => executeStep(step))
    )
    results.push(...batchResults)

    // 推送进度到 UI
    emit('fold:state', { status: 'working', steps: results })

    // 如果关键步骤失败，中断
    if (batchResults.some(r => r.status === 'failed' && !r.step.retryable)) {
      break
    }
  }

  return { steps: results, failures: results.filter(r => r.status === 'failed') }
}
```

---

### 3.5 Validator

任务完成后统一校验，不在每步调用 LLM。

```typescript
interface Validator {
  check(plan: ActionPlan, results: ExecutionResult): Promise<ValidationResult>
}

interface ValidationResult {
  ok: boolean
  checks: Array<{ rule: string; passed: boolean; message?: string }>
}
```

#### 校验规则（Demo 阶段用规则，不用 LLM）

```typescript
const rules = {
  'pdf.fields.nonEmpty': (results) => {
    const pdf = results.steps.find(s => s.stepId === 's2')
    return pdf?.output && Object.keys(pdf.output).length > 0
  },
  'mail.draft.exists': (results) => {
    const mail = results.steps.find(s => s.stepId === 's3')
    return mail?.status === 'success'
  },
}
```

---

### 3.6 Router（执行层级路由）

```typescript
interface Router {
  resolve(intent: string, context: LiveContext): 'compiled' | 'plan' | 'react'
}
```

| 条件 | 路由到 |
|------|--------|
| 匹配 Compiled Skill 模式 | Tier 0 |
| 有明确 Skill 可组合 | Tier 1（默认） |
| 无 Skill 覆盖 + 需要 GUI | Tier 2 |

Demo 阶段只实现 Tier 1，Tier 0 和 Tier 2 留接口。

---

### 3.7 失败恢复

```typescript
type RecoveryAction =
  | { type: 'retry' }
  | { type: 'replan'; newStep: ActionStep }
  | { type: 'repair'; agent: string; budget: number }
  | { type: 'ask'; question: string; options: AskOption[] }
  | { type: 'abort'; reason: string }

async function handleFailure(
  failure: StepFailure,
  plan: ActionPlan,
  context: LiveContext,
): Promise<RecoveryAction> {
  // 1. 可重试？
  if (failure.retryable && failure.attempts < 2) {
    return { type: 'retry' }
  }

  // 2. 可局部重规划？
  if (failure.code === 'entity.ambiguous' || failure.code === 'entity.notFound') {
    if (failure.candidates?.length) {
      return { type: 'ask', question: failure.message, options: failure.candidates }
    }
    const newStep = await planner.replanStep(failure.step, failure, context)
    return { type: 'replan', newStep }
  }

  // 3. 需要 GUI 修复？
  if (failure.code === 'gui.windowNotFound' || failure.code === 'gui.actionFailed') {
    return { type: 'repair', agent: selectRepairAgent(failure), budget: 5 }
  }

  // 4. 放弃
  return { type: 'abort', reason: failure.message }
}
```

---

## 4. Skills 系统

### 4.1 Skill 接口

```typescript
interface Skill {
  id: string                          // e.g. "pdf.extract"
  name: string
  description: string
  inputSchema: ZodSchema
  outputSchema: ZodSchema
  permissions: Permission[]           // e.g. ["filesystem.read", "mail.write"]
  connector: string                   // 默认 connector
  execute(args: unknown, ctx: SkillContext): Promise<unknown>
}

interface SkillContext {
  liveContext: LiveContext
  previousResults: Map<string, unknown>  // 前序 step 的输出
  emit: (event: ProgressEvent) => void
}
```

### 4.2 内置 Skills（Demo）

| Skill ID | 功能 | Connector | 输入 | 输出 |
|----------|------|-----------|------|------|
| `finder.latestDownload` | 获取最新下载文件 | Shell | `{ ext?, since? }` | `{ path, name, size }` |
| `pdf.extract` | 提取 PDF 字段 | Shell (Python) | `{ path, fields[] }` | `{ vendor, amount, date, ... }` |
| `mail.draft` | 创建邮件草稿 | AppleScript | `{ to, subject?, body, template? }` | `{ draftId, subject }` |
| `browser.currentPage` | 获取当前页面信息 | CDP / Extension | `{}` | `{ url, title, selectedText? }` |
| `clipboard.read` | 读取剪贴板 | Native | `{}` | `{ text, timestamp }` |

### 4.3 Skill 注册

```typescript
// packages/skills/src/registry.ts
const registry = new SkillRegistry()

registry.register(finderLatestDownload)
registry.register(pdfExtract)
registry.register(mailDraft)
registry.register(browserCurrentPage)
registry.register(clipboardRead)

export { registry }
```

### 4.4 未来 Skill 插件格式

```
my-skill/
├── skill.json          # manifest
├── index.ts            # execute()
├── permissions.json
└── examples/
    └── demo.md
```

```json
{
  "id": "airtable.update",
  "name": "Update Airtable Record",
  "version": "1.0.0",
  "permissions": ["network.airtable"],
  "connector": "playwright",
  "input": { "baseId": "string", "table": "string", "records": "array" }
}
```

---

## 5. Connector Layer

### 5.1 Connector 接口

```typescript
interface Connector {
  id: string
  supports(skill: string): boolean
  execute(action: ConnectorAction): Promise<ConnectorResult>
}

interface ConnectorAction {
  type: string
  args: Record<string, unknown>
  timeout: number
}
```

### 5.2 Connector 优先级

```typescript
function selectConnector(skill: string, context: LiveContext): Connector {
  const chain = [
    'rest',         // REST API（最快）
    'playwright',   // 浏览器 CDP
    'applescript',  // macOS 系统应用
    'shell',        // Shell / Python 脚本
    'accessibility',// macOS AX API
    'uitars',       // Vision + GUI（最慢，兜底）
  ]

  for (const id of chain) {
    const connector = connectors.get(id)
    if (connector.supports(skill)) return connector
  }

  throw new Error(`No connector for skill: ${skill}`)
}
```

### 5.3 各 Connector 实现

| Connector | 技术 | 适用 | Demo |
|-----------|------|------|------|
| `shell` | Node child_process + Python | 文件操作、PDF 解析 | ✅ |
| `applescript` | osascript | Mail、Calendar、Finder | ✅ |
| `playwright` | Playwright + CDP | 浏览器内操作 | 接口 |
| `accessibility` | macOS AX API | 微信、飞书等无 API 应用 | 接口 |
| `uitars` | UI-TARS Desktop SDK | 通用 GUI 兜底 | 接口 |

---

## 6. Memory

> 详细的上下文压缩、短期/长期记忆设计见 [`docs/memory-context.md`](./memory-context.md)。

### 6.1 数据模型

```sql
-- Live Context（内存 + SQLite 缓存，30 min TTL）
-- 不需要独立表，存在内存 ring buffer 中

-- Episodes
CREATE TABLE episodes (
  id          TEXT PRIMARY KEY,
  timestamp   INTEGER NOT NULL,
  intent      TEXT NOT NULL,
  goal        TEXT,
  apps        TEXT,       -- JSON array
  files       TEXT,       -- JSON array
  contacts    TEXT,       -- JSON array
  result      TEXT,
  summary     TEXT,
  plan        TEXT,       -- JSON ActionPlan
  duration_ms INTEGER
);

-- Long-term Memory
CREATE TABLE memories (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,  -- 'preference' | 'contact' | 'project' | 'pattern'
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  source      TEXT,           -- episode id
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_episodes_timestamp ON episodes(timestamp);
CREATE INDEX idx_memories_type ON memories(type);
```

### 6.2 Episode 自动生成

任务完成后，Orchestrator 自动提取并保存：

```typescript
async function saveEpisode(
  intent: string,
  plan: ActionPlan,
  results: ExecutionResult,
): Promise<Episode> {
  return {
    id: uuid(),
    timestamp: Date.now(),
    intent,
    goal: plan.goal,
    apps: extractApps(results),
    files: extractFiles(results),
    contacts: extractContacts(results),
    result: summarize(results),
    plan,
    durationMs: results.totalDuration,
  }
}
```

---

## 7. AI Provider

### 7.1 多模型支持

```typescript
interface AIProvider {
  id: string
  chat(messages: Message[], options?: ChatOptions): Promise<string>
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<string>
}

// 支持的 Provider（全部 OpenAI Compatible API）
const providers = {
  claude:  { baseUrl: 'https://api.anthropic.com/v1', ... },
  openai:  { baseUrl: 'https://api.openai.com/v1', ... },
  gemini:  { baseUrl: 'https://generativelanguage.googleapis.com/v1', ... },
  qwen:    { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', ... },
}
```

### 7.2 模型分工

| 角色 | 推荐模型 | 原因 |
|------|----------|------|
| Planner | Claude Sonnet / GPT-4o | 需要结构化输出能力 |
| Validator | 规则引擎（无 LLM） | Demo 阶段够用 |
| Repair Sub-agent | Claude Sonnet | 需要推理能力 |
| Compiled Skill | 无 LLM | 零延迟 |

---

## 8. 进程架构

```
┌─────────────────────────────────────────────────┐
│                  Electron Main                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Overlay  │  │ MenuBar  │  │ Settings     │  │
│  │ Window   │  │ Tray     │  │ Window       │  │
│  └────┬─────┘  └──────────┘  └──────────────┘  │
│       │ IPC                                      │
│  ┌────┴─────────────────────────────────────┐   │
│  │           Fold Runtime (Node.js)          │   │
│  │                                           │   │
│  │  Orchestrator                             │   │
│  │  ├── Context Engine (event listeners)     │   │
│  │  ├── Planner (AI call)                    │   │
│  │  ├── Executor (skill runner)             │   │
│  │  ├── Validator                            │   │
│  │  └── Memory (SQLite)                      │   │
│  └───────────────────────────────────────────┘   │
│       │                    │                      │
│  ┌────┴─────┐        ┌────┴─────┐               │
│  │ Native   │        │ Child    │               │
│  │ Addons   │        │ Processes│               │
│  │ (AX, FS) │        │ (Python, │               │
│  │          │        │ osascript)│               │
│  └──────────┘        └──────────┘               │
└─────────────────────────────────────────────────┘
```

### 8.1 IPC 通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `fold:state` | Main → Overlay | 状态更新 |
| `fold:transcript` | Voice → Overlay | 阿里云 ASR 流式 partial 字幕 |
| `fold:hotkey` | Main → Runtime | 快捷键事件 |
| `fold:voice-start` | Main → Runtime | 开始录音（阿里云 ASR） |
| `fold:voice-end` | Main → Runtime | 结束录音 → final 文本 → 触发执行 |
| `fold:ask-response` | Overlay → Main | 用户选择回复 |
| `fold:context` | Runtime → Main | Context 事件 |

---

## 9. 技术选型

| 层 | 技术 | 理由 |
|----|------|------|
| Desktop Shell | Electron 34 | 最快落地 macOS overlay + native API |
| UI | React 19 + Vite + Tailwind 4 + Framer Motion | 团队熟悉，生态成熟 |
| Web（后续） | Next.js + shadcn/ui | Marketplace / Dashboard |
| Runtime | Node.js + TypeScript | 与 Electron 同构 |
| State | Zustand | 轻量，适合 Overlay |
| Local DB | SQLite（better-sqlite3） | 零配置，性能够用 |
| Schema Validation | Zod | Skill I/O 校验 |
| Browser Automation | Playwright | CDP，成熟稳定 |
| File/PDF | Python subprocess | pdfplumber / PyMuPDF |
| System Apps | AppleScript (osascript) | Mail / Calendar / Finder |
| GUI Fallback | UI-TARS SDK | 兜底，不作为主路径 |
| Voice | 阿里云 ASR（其他项目已实现，迁入 `packages/voice`） | 见 `docs/integrations.md` |
| AI | OpenAI Compatible Router | 多模型切换 |
| Monorepo | pnpm + Turborepo | 多 package 管理 |
| Build | electron-forge + Vite | Electron 打包 |

---

## 10. 开发阶段

### Phase 1（Week 1）：跑通 Runtime + Overlay

- [ ] Monorepo 脚手架
- [ ] Electron overlay 窗口（Idle / Listening / Working / Done）
- [ ] 全局快捷键
- [ ] 语音输入接入
- [ ] Runtime 骨架（Orchestrator / Planner / Executor）
- [ ] IPC 状态流

### Phase 2（Week 2）：Context Engine

- [ ] App 切换监听
- [ ] Downloads 文件夹监听（FSEvents）
- [ ] Clipboard 监听
- [ ] Chrome URL 采集（扩展 or CDP）
- [ ] Live Context store
- [ ] Event 规则过滤

### Phase 3（Week 3）：Skills + Demo 闭环

- [ ] `finder.latestDownload` skill
- [ ] `pdf.extract` skill
- [ ] `mail.draft` skill
- [ ] Planner prompt + ActionPlan 生成
- [ ] Executor 执行 + 进度推送
- [ ] Validator 规则校验
- [ ] Episode 记录
- [ ] 端到端 Demo 录屏

### Phase 4（后续）

- [ ] Compiled Skill（Tier 0）
- [ ] Repair Sub-agents
- [ ] UI-TARS fallback（Tier 2）
- [ ] Playwright connector
- [ ] Next.js Marketplace
- [ ] Skill SDK

---

## 11. 性能目标

| 指标 | 目标 | 手段 |
|------|------|------|
| Overlay 唤醒 | < 200ms | 窗口预创建，不按需创建 |
| 语音 → 执行启动 | < 2s | Planner 用快速模型 |
| 单步 Skill 执行 | < 500ms | API/Script 优先，不走 Vision |
| 完整 Demo 任务 | < 5s | Tier 1，3 步，0~1 次 LLM |
| Context 事件延迟 | < 500ms | 内存 ring buffer |
| LLM 调用（主路径） | ≤ 2 次 | Plan 1 次 + 可选 Validator |

---

## 12. 安全 & 权限

| 权限 | 用途 | 申请时机 |
|------|------|----------|
| Accessibility | 窗口标题、AX 操作 | 首次启动 |
| Microphone | 语音输入 | 首次录音 |
| Full Disk Access | Downloads 监听 | 首次文件操作 |
| Automation (AppleScript) | Mail / Calendar 控制 | 首次执行 |
| Network | AI API 调用 | 首次执行 |

所有权限在 Settings 页面可查看和重新申请。Skill 级别的 `permissions` 字段用于运行时权限检查。
