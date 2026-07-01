# Fold Memory & Context Compaction

## 1. 调研结论

优秀 agent 的共同点不是“把上下文窗口撑大”，而是把上下文窗口当成临时工作区，把记忆做成运行时拥有的外部系统。

### Claude Code / Claude API

Claude Code 的关键经验：

- `/compact` 或自动 compaction 会把长对话替换成结构化摘要。
- 根目录 `CLAUDE.md`、全局规则、auto memory 会从磁盘重新注入。
- 临时加载进对话历史的内容会被摘要吞掉，除非之后重新触发读取。
- subagent 可以把大量探索、文件读取、工具输出隔离在子上下文里，避免污染主上下文。

Claude API 侧也把 compaction 做成 context-management 能力：到 token 阈值时生成 compaction block，后续请求从压缩块继续，而不是让客户端手写“总结一下上文”。

Fold 可以吸收的点：

- 持久规则和偏好必须落盘，不能只存在一次对话里。
- 每次任务前要重建 working context，而不是把所有历史塞进 prompt。
- 子 Agent 的探索结果应只回传结论、证据和少量可复现步骤。

### Cursor Composer

Cursor 的 self-summarization 经验是：长任务中 compaction 不是纯工程补丁，而是 agent harness 的一部分。模型接近上下文上限时，会把当前任务状态、计划、剩余工作和关键发现压缩后继续。

Fold 可以吸收的点：

- 压缩内容必须保留“当前计划状态”，而不只是聊天摘要。
- 对长任务要保存 `remainingTasks`、`openQuestions`、`lastKnownState`。
- compaction 质量会直接影响长程任务成功率，所以摘要格式要稳定、可测试。

### Mem0 / Letta / LangGraph 等记忆系统

现代 agent memory 基本收敛到四层：

- Working memory：当前任务的工作集，进入 prompt。
- Episodic memory：发生过什么，按时间存 episode。
- Semantic memory：稳定事实、偏好、联系人、项目知识。
- Procedural memory：如何做事，体现为 skills、rules、workflows。

核心原则：

- 不要把 prompt 当数据库。
- runtime 拥有 memory，LLM 只能提出候选，不能直接写永久记忆。
- 长期记忆写入前要 curated：有来源、类型、置信度、更新时间和是否仍有效。
- 检索要按当前目标窄取，而不是每次倒入所有历史。

## 2. Fold 现状

当前已有：

- `ContextStore`：30 分钟 TTL 的 Live Context，保存 active app、recent files、recent URLs、clipboard。
- `Episode`：每次任务后保存 intent、goal、plan、steps、status、summary。
- `ProbeRunner`：任务前并行收集当前能力和环境事实。

当前缺口：

- Episode summary 只是成功 skill 列表，不够支持未来检索和复盘。
- 没有长期 `memories` 表，用户偏好、联系人、项目知识无法跨任务稳定复用。
- 没有 context budget，也没有 prompt assembler 负责选择哪些 context 进 Planner。
- 没有 memory extraction 流程，LLM 的一次任务发现不会沉淀成可治理记忆。
- 没有 compaction 格式，React Tier 2 / Subagent 长任务会丢失关键状态。

## 3. Fold 目标架构

Fold 的 memory 不应该复制聊天产品，而应围绕桌面 Agent 的任务链路设计。

### 3.0 Raw Retention 是产品差异

Fold 的关键区别是：**实时操作记录和留存模式不因为 compaction 被丢弃**。

这和 Claude Code / Cursor 这类 coding agent 不一样。它们的 compaction 主要服务“当前 agent 上下文还能继续工作”；Fold 还要服务“用户电脑发生了什么”的本地事实留存。

因此 Fold 必须分清两类数据：

| 层 | 是否可丢弃 | 用途 |
|----|------------|------|
| Raw Context Events | 不因 compaction 丢弃；按用户 retention policy 保留 | 审计、回放、长期个性化、跨任务检索 |
| Episode Raw Results | 不因 compaction 丢弃；按任务留存 | 复盘一次任务到底做了什么 |
| Compacted Summary | 可重建、可覆盖 | 给 Planner / Router / Subagent 的短上下文工作视图 |
| Working Context | 每次任务临时组装 | 当前模型调用 |

换句话说：

```text
实时操作记录 / Episode 原始记录 = source of truth
Compaction / Summary = derived working view
```

任何 compaction 都不能删除 raw events，只能生成新的摘要或索引。删除 raw retention 必须是用户显式的数据留存策略，而不是 agent 上下文管理的副作用。

### 3.1 Working Context

每次 Planner 调用前由 runtime 组装：

- 用户当前 intent。
- Live Context 摘要。
- Probe Summary。
- 当前任务相关的 recent episodes。
- 命中的 semantic memories。
- 必要 procedural hints：可用 skill、权限、安全约束。

Working Context 是“临时视图”，不是存储层。

### 3.2 Episodic Memory

每次任务保存一条 episode，但要从“skill 列表”升级为结构化任务记录：

```typescript
interface EpisodeSummary {
  intent: string;
  goal: string;
  outcome: "success" | "partial" | "failed";
  userVisibleResult: string;
  apps: string[];
  files: string[];
  urls: string[];
  skills: string[];
  failures: string[];
  learnedCandidates: MemoryCandidate[];
}
```

用途：

- 复盘“上次怎么做的”。
- 给 Router 判断某类任务是否已有成功路径。
- 给 Planner 提供少量相关先例。

### 3.3 Semantic Memory

长期保存稳定事实：

- 用户偏好：例如默认邮件客户端、输出语言、是否允许脚本。
- 联系人：姓名、邮箱、常用称呼。
- 项目知识：常用目录、系统、账号入口。
- 业务规则：比如“待处理邮件”在用户语境里等同于 Apple Mail inbox unread。

建议 schema：

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.8,
  source_episode_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);
```

写入原则：

- LLM 只输出 `MemoryCandidate`。
- runtime 根据 allowlist、用户授权和置信度决定是否写入。
- 涉及隐私、账号、联系人等信息要可查看、可删除。

### 3.4 Procedural Memory

Procedural memory 对应 Fold 的 skills / router / rules：

- 静态：`SkillRegistry`、Planner catalog、sandbox policy。
- 动态：某个任务验证成功后生成 reusable pattern，例如“统计邮件未读数走 Apple Mail AppleScript”。

首期不要让 procedural memory 自动改代码或改 skill，只保存候选 pattern，人工确认后再固化。

## 4. Context Compaction 设计

Fold 需要两类 compaction。

### 4.1 Task Compaction

用于 React Tier 2 / Subagent 长任务。

触发：

- 子 Agent 超过 step budget 的 70%。
- observation/tool output 累积过长。
- 主 Agent 准备接回子 Agent 结果。

输出格式：

```typescript
interface TaskCompaction {
  goal: string;
  currentState: string;
  completedSteps: string[];
  failedSteps: string[];
  evidence: Array<{ type: string; value: string }>;
  remainingSteps: string[];
  blockers: string[];
  safetyNotes: string[];
}
```

原则：

- 保留事实和证据，不保留完整推理。
- 保留可复现步骤，不保留大段工具输出。
- 子 Agent 回主 Agent 只交付 compacted result。

### 4.2 Episode Compaction

用于任务结束后写 memory。

输入：

- intent、plan、step results、validator result、probe summary。

输出：

- user-visible summary。
- structured episode。
- memory candidates。

这一步可以用小模型或规则优先；涉及长期 memory 写入时才调用 LLM 分类。

## 5. Prompt Assembler

新增 `PromptAssembler`，统一控制 Planner 输入，避免 planner.ts 里不断拼字符串。

```typescript
interface PromptContext {
  intent: string;
  liveContext: string;
  probeSummary: string;
  relevantEpisodes: EpisodeSummary[];
  relevantMemories: MemoryRecord[];
  skillCatalog: string;
  safetyPolicy: string;
}
```

职责：

- 给每类 context 分 token budget。
- 只选当前 intent 相关的 memories / episodes。
- 把安全策略和 skill catalog 作为高优先级上下文。
- 生成可测试的 prompt block。

建议预算：

- Intent + safety：必须保留。
- Skill catalog：必须保留，但可按 Router 过滤。
- Live context + probe：保留最近和相关项。
- Episodes：最多 3 条。
- Memories：最多 10 条，按相关性和 last_used_at 排序。

## 6. 实施顺序

### Phase A：修现有 memory 基础

- 修复 `better-sqlite3` native ABI / Electron 构建问题。
- Episode summary 改为结构化 JSON。
- 保存 probe summary 和 validation checks。

### Phase B：PromptAssembler

- 从 `planner.ts` 抽出 prompt 组装。
- 接入 probe summary、skill catalog、安全策略。
- 为 prompt block 写 snapshot 测试。

### Phase C：Semantic Memory

- 新增 `memories` 表。
- 实现 `memory.extractCandidates(results)`。
- Settings 增加 memory 查看/删除入口。

### Phase D：Retrieval

- 先用关键词和类型过滤，不急着上 vector DB。
- 支持按 intent 检索 relevant episodes / memories。
- 后续再加 embedding。

### Phase E：React Tier 2 Compaction

- 给 Subagent 增加 `TaskCompaction` 输出协议。
- 主 Agent 只接收 compacted result。
- 长任务定期压缩 observation/tool outputs。

## 7. 不做什么

- 不把完整屏幕录制/OCR 日志当长期记忆。
- 不把所有 episode 全塞进 Planner prompt。
- 不让 LLM 直接写永久 memory。
- 不在 MVP 阶段引入复杂向量库作为前置依赖。
- 不把 compaction 做成自由文本总结，必须结构化。

## 8. 对当前路线的影响

当前路线仍然成立：

```text
Script Runtime → Mail E2E → ProbeRunner → Router → CDP → React Tier 2
```

但在 Router 完整化之前，应该插入一个小阶段：

```text
Memory Phase A/B：结构化 Episode + PromptAssembler
```

原因是 Router、React Tier 2、Subagent 都依赖稳定的 working context 和任务状态压缩。如果先做 React，后补 memory，很容易变成“能动但容易忘、容易漂”的 Computer Use。
