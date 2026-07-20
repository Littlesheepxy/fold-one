# Fold Agent Harness 架构对标与演进 RFC

> 状态：Proposed  
> 日期：2026-07-16  
> 目标：Fold 不与 Codex / Claude Code / Cursor 争夺 coding agent 能力，而是成为更快的意图入口、上下文与记忆层、跨应用执行控制面。

## 1. 结论

Fold 不应该自研另一个“大而全 ReAct agent”。成熟项目已经证明，更可靠的 agent 产品通常由以下边界构成：

1. 持久 Thread / Run 与短期 Turn / Step 分离。
2. append-only typed event log 是事实源，UI、任务状态和模型上下文都是派生视图。
3. 在可恢复边界保存 snapshot；恢复时跳过已经成功且有 receipt 的副作用。
4. 模型记忆、运行状态、长期用户记忆分层存储，不把 prompt 当数据库。
5. 工具执行前后有确定性的 policy / hook 层，安全规则不能只靠提示词。
6. Agent worker 使用窄而稳定的任务 envelope，并只回传结构化 evidence。
7. 高容量探索放在隔离 worker 中，主上下文只接 compact handoff。

Fold 已有 `TaskMoment`、`AgentTaskEnvelope`、`task_runs`、step checkpoint、Agent session resume，方向正确。下一步不是继续给 orchestrator 堆分支，而是把它们收敛为统一的事件与状态协议。

## 2. 对标项目的可复用机制

### 2.1 Codex：Thread / Turn / Item + 双向 App Server

Codex App Server 把 durable thread、单次 turn 和中间 item 明确分层；一个请求对应多条稳定、UI-ready 的通知，server 还可以反向发起 approval request。Thread 可以 resume、fork、archive。

Fold 采用：

- `threadId`：一个可持续任务/工作流，例如“飞书客户跟进”。
- `runId`：用户本次触发。
- `workerSessionId`：Codex / Claude / Cursor 自己的 session，只是 run 的执行资源。
- 所有 worker 事件先归一化为 Fold event，再投影到 Overlay；UI 不直接理解各 CLI 的私有 JSON。

来源：[OpenAI — Unlocking the Codex harness](https://openai.com/index/unlocking-the-codex-harness/)

### 2.2 Claude Code：分层 memory、hooks、checkpoint、隔离 subagent

Claude Code 把持久规则与自动学习分开：`CLAUDE.md` 是人维护的规则，auto memory 是 agent 维护的项目知识；启动只加载精简索引，主题文件按需读取。Hooks 在 `PreToolUse`、`PostToolUse`、`Stop` 等固定生命周期触发，阻断逻辑由客户端执行。Checkpoint 追踪 edit 前状态并支持 rewind。Subagent 使用独立 context，高容量输出只回摘要。

Fold 采用：

- `PolicyMemory`：用户/组织明确规则，永远高于模型候选记忆。
- `SemanticMemory`：运行中学到的偏好、项目和联系人事实，有来源、置信度、过期与撤销。
- `beforeAction / afterAction / onFailure / beforeComplete` hooks。
- 只有确定性的 hook 可以阻断；LLM 只能建议 ask/deny，不能绕过 policy。
- Coding worker 的大日志不进入 Fold 主上下文，只保存 compact handoff + artifact refs。

Fold 适配：

- Claude 的文件 checkpoint 只覆盖编辑工具，Fold 是跨应用系统，必须升级成 connector receipt + inverse action；例如消息发送无法“还原文件”，只能记录 message ID、幂等键及可用的撤回动作。

来源：[Claude Code memory](https://code.claude.com/docs/en/memory)、[hooks](https://code.claude.com/docs/en/hooks)、[checkpointing](https://code.claude.com/docs/en/checkpointing)、[subagents](https://code.claude.com/docs/en/sub-agents)

### 2.3 OpenHands：append-only events + View / Condenser + sandbox runtime

OpenHands 将 immutable typed events 作为 agent memory 和外围服务的集成点；Action、Observation、Pause、StateUpdate、Condensation 都是事件。Condenser 不删除原始日志，而是生成带 `forgotten_event_ids` 的 summary event；模型拿到的是 View。执行环境通过 client/server 隔离，Action 进入 sandbox，Observation 返回控制面。

Fold 采用：

- 原始事件不可变；`task_runs` 是 materialized projection，不再是唯一事实源。
- `WorkingView = reduce(events) + context selection + condensation`。
- compaction 只影响模型视图，不删除语音、剪贴板、AX、connector receipt 等本地事实。
- `ActionRequested` 与 `ActionObserved` 分开，解决“调用超时但外部其实成功”的不确定状态。

Fold 适配：

- 默认不把所有桌面操作放进 Docker；macOS AX、前台应用和本地 CLI 需要宿主能力。隔离边界放在 coding worker/worktree、脚本插件和高风险第三方工具，而不是整个 Fold runtime。

来源：[OpenHands events](https://docs.openhands.dev/sdk/arch/events)、[condenser](https://docs.openhands.dev/sdk/arch/condenser)、[runtime](https://docs.openhands.dev/openhands/usage/architecture/runtime)

### 2.4 LangGraph：super-step checkpoint、pending writes、interrupt

LangGraph 在每个 super-step 边界保存 graph state。并行节点中部分成功、部分失败时，成功节点的 pending writes 会保留，恢复不重复运行。Interrupt 先持久化状态再等待用户输入；恢复时节点会从头运行，因此副作用必须幂等。

Fold 采用：

- 一个 DAG batch 是一个 `superStep`。
- batch 前保存 scheduled state，batch 后保存 outputs / receipts / next steps。
- 并行步骤的成功结果独立提交，其他步骤失败时不重跑成功副作用。
- ask/approval 是 durable interrupt，不是 Electron 内存里的 Promise。

Fold 拒绝：

- 当前不引入 LangGraph 运行时依赖。Fold 的 compiled/plan/react 三层路由和现有 TypeScript executor 足够；借用状态语义，不迁移框架。

来源：[LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)、[interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)、[Functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api)

### 2.5 SWE-agent：窄 ACI 比“万能 shell”更可靠

SWE-agent 的核心经验是 Agent-Computer Interface 需要专门设计：限制文件查看窗口、提供简洁搜索结果、编辑后立即 lint、空输出也返回明确 observation。工具界面的信息密度会显著影响 agent 成功率。

Fold 采用：

- connector 返回稳定 envelope，而不是把 stdout 原样交给模型。
- 每个 IM connector 提供 `resolveTarget`、`previewAction`、`executeAction`、`verifyReceipt` 四个窄操作。
- CLI 参数错误属于 contract failure，直接走 adapter repair，不让 LLM盲猜同一参数。

来源：[SWE-agent ACI](https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/aci.md)

### 2.6 Aider / Cline：预算化 context map 与可见 undo

Aider 用 tree-sitter + dependency graph 生成动态 token budget 内的 repo map，并用 Git 隔离/回滚修改。Cline 把 Plan/Act 分开，显示 diff，并为改动保存 checkpoint。

Fold 采用其思想，不照搬 coding 数据结构：

- 为桌面任务构建 `EntityMap`：当前 app/window、联系人、文件、URL、会话、近期 clipboard entity 及它们的关系。
- 根据 intent 和预算选取 EntityMap 子图，替代把最近事件全文塞进 prompt。
- 对可逆操作展示 undo receipt；对不可逆操作展示执行证据和审批点。
- coding worker 继续使用它自身的 repo map / Git / worktree，Fold 不重复实现。

来源：[Aider repository map](https://aider.chat/docs/repomap.html)、[Git integration](https://aider.chat/docs/git.html)、[Cline repository](https://github.com/cline/cline)

## 3. Fold 目标数据协议

### 3.1 IDs

```typescript
interface RunIdentity {
  threadId: string;        // Fold 长期工作流
  runId: string;           // 一次用户触发
  turnId?: string;         // 一次 planner/worker round
  workerSessionId?: string;// 外部 coding agent session
}
```

不能再把 `runId` 同时当 Thread 和 Agent session。外部 session 可更换，Fold thread 和 memory 仍然连续。

### 3.2 Append-only RunEvent

```typescript
interface RunEvent<T = unknown> {
  id: string;
  runId: string;
  sequence: number;
  type:
    | "run.created"
    | "plan.created"
    | "step.scheduled"
    | "step.started"
    | "action.requested"
    | "policy.decided"
    | "approval.requested"
    | "approval.resolved"
    | "action.observed"
    | "step.completed"
    | "step.failed"
    | "worker.session.bound"
    | "memory.candidate.created"
    | "run.canceled"
    | "run.completed";
  causationId?: string;
  correlationId?: string;
  schemaVersion: number;
  payload: T;
  at: number;
}
```

要求：

- 只 append，不原地改事件。
- `task_runs`、Overlay state、Episode、Agent working view 由 reducer 投影。
- 所有外部副作用至少有 request 和 observation 两条事件。
- Event payload 只保存 compact data，大对象存 artifact，event 保存引用。

### 3.3 SideEffectReceipt

```typescript
interface SideEffectReceipt {
  effectId: string;
  idempotencyKey: string;
  connector: string;
  operation: string;
  targetFingerprint: string;
  inputHash: string;
  status: "requested" | "confirmed" | "uncertain" | "failed";
  externalRef?: string;       // message_id / event_id / file path
  verification?: unknown;
  inverseAction?: unknown;    // 可选撤回/恢复动作
}
```

恢复前先查 receipt：

- `confirmed`：不重放，直接复用 observation。
- `uncertain`：先 `verifyReceipt`，不能直接重试发送。
- `failed` 且 connector 声明 retry-safe：允许按预算重试。

### 3.4 HookDecision

```typescript
interface HookDecision {
  decision: "allow" | "deny" | "ask" | "rewrite";
  reason: string;
  rewrittenArgs?: Record<string, unknown>;
  source: "policy" | "connector" | "user" | "model";
}
```

顺序固定：`PolicyHook → ConnectorHook → UserApproval → Execute → VerifyHook → MemoryCandidate`。

## 4. Adopt / Adapt / Reject

| 机制 | 决策 | Fold 实现 |
|---|---|---|
| Codex Thread/Turn/Item | Adopt | Fold Thread/Run/Event，worker session 单独绑定 |
| OpenHands append-only events | Adopt | `task_run_events` 为事实源，SQLite 本地优先 |
| OpenHands condenser | Adopt | 生成 WorkingView，不删除 raw context |
| LangGraph checkpoint/pending writes | Adapt | 保留现有 executor，按 DAG batch 保存 snapshot |
| Claude hooks | Adopt | deterministic lifecycle hooks，可阻断 action |
| Claude/Aider file checkpoint | Adapt | connector receipt + inverse action；coding 交给本地 agent |
| SWE-agent ACI | Adopt | 为 IM/Calendar/Mail 做窄、结构化 connector contract |
| Aider repo map | Adapt | Fold EntityMap；coding repo map 不重复实现 |
| OpenHands 全量 Docker runtime | Reject | 宿主 AX/语音/前台上下文不能被容器取代 |
| 再造 coding agent loop | Reject | Codex/Claude/Cursor 是 worker，Fold 是 control plane |
| 自动把所有观察写长期记忆 | Reject | candidate → policy/用户治理 → durable memory |

## 5. 当前实现差距

| 已有 | 差距 |
|---|---|
| `task_runs` + `task_checkpoints` | checkpoint 是日志，不是可 reducer/replay 的统一事件 |
| `TaskMoment` | 仍是平铺摘要，缺 EntityMap 与 token budget |
| `AgentTaskEnvelope` | 已有 run contract，但缺独立 `threadId/turnId` |
| `AbortSignal` + `turn/interrupt` | cancel 可用，pause/approval 仍不是 durable interrupt |
| Agent session resume | 同一次 repair 可续接，app 重启后的 resume 入口未投影出来 |
| Episode / semantic memory | 已分层，但缺 event-derived memory candidate pipeline |
| idempotency key | 只在 prompt/envelope，缺 connector 强制 receipt ledger |

## 6. 实施顺序

### P0：事件事实源与副作用账本

1. 新增 `task_run_events`，实现 `appendRunEvent/listRunEvents`。
2. 定义 reducer，从事件生成 `TaskRunState`；`task_runs` 变成缓存投影。
3. 将现有 step checkpoints 双写为 typed events，验证无回归后再收敛旧表。
4. 新增 `side_effect_receipts`；先覆盖飞书/企微/钉钉消息发送。

验收：进程在“发送已成功但返回前崩溃”时，恢复后不会重复发送。

### P1：durable interrupt 与 hooks

1. 把 `requestUserAction` 从内存 Promise 改为 `approval.requested` 事件。
2. UI 回答追加 `approval.resolved`，runtime 从 checkpoint 恢复。
3. 引入 `beforeAction/afterAction/beforeComplete` hook registry。
4. 邮件发送、IM 发送、日程创建默认经过风险与重复检查 hook。

验收：退出并重开 Electron 后，待确认任务仍能继续；deny 不会触发 connector。

### P2：WorkingView / EntityMap / Condenser

1. 从 raw context + events 生成 EntityMap。
2. 为 compiled / planner / worker 分别定义 context budget。
3. condenser 保留 goal、receipts、failed contracts、next steps 和 evidence refs。
4. worker handoff 与 Episode 都从 event view 生成。

验收：长任务 prompt 大小有硬上限；compaction 后不丢外部 message ID、待执行步骤和安全约束。

### P3：多 worker 与 coding 隔离

1. 仅对独立、高容量任务启用 subagent。
2. coding worker 使用自己的 repo map、checkpoint、Git/worktree。
3. Fold 只维护 delegation、session binding、evidence 与用户记忆。

验收：多个 worker 不污染同一工作树；Fold 可以切换 Codex/Claude/Cursor 而不丢 thread 状态。

## 7. 工程约束

- 新机制先在飞书消息 E2E 验证，再扩企微/钉钉。
- 事件 schema 必须版本化；新代码能读取旧事件。
- 原始语音、剪贴板与 AX 只在本地，Agent 默认只拿 TaskMoment/EntityMap 的最小必要视图。
- 所有恢复逻辑以 receipt 为准，不以模型“我已经做了”作为成功证据。
- 不为了框架一致性牺牲 compiled fast path；简单任务仍应不经 LLM。
