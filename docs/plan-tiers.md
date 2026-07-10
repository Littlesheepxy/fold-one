# Fold 版本与权益

Fold 的收费边界不是“能不能使用”，而是 Context 能被利用到什么程度。

## 三个版本

| 能力 | 免费版 Free | 付费版 Pro | 升级版 Ultra |
|------|-------------|------------|----------------|
| Context / Episode / 基础 Memory | 本地完整开放 | 完整开放 | 完整开放 |
| ASR | 本地 FunASR（规划）+ Whisper 备份 | DashScope 云端 + 热词 | 更高额度、长录音与优先能力 |
| 净化 | 本地规则 | 云端复杂净化 | 更强模型 |
| 代回 | AX 上下文 + 本地降级草案 | OCR + 情境草案 | 更强模型与更多候选 |
| Agent | 智能体验额度；之后 BYOK | 托管轻量任务额度 | 跨应用、多步骤 Agent |
| Codex / Claude Code / Cursor | 用户手动调用自有 CLI | 基础 handoff | 自动 Subagent 编排与失败恢复 |
| UI-TARS / VLM | BYOK | — | 高级 GUI 恢复 |

## 核心购买理由

- Free：每天都能用。本地语音、基础净化、Context、工作轨迹和记忆。
- Pro：它更懂你。准确识别、热词、复杂净化、情境代回和轻量执行。
- Ultra：它替你完成。跨应用 Agent、本地代码 Agent 编排和高级恢复。

## 智能体验

新安装默认赠送 20 次智能体验，可用于复杂净化、情境代回或 Agent 任务。

- 只有成功产出智能结果才扣减。
- 模型或网络失败不扣减。
- 额度耗尽后自动回落本地能力。
- BYOK 使用用户自己的 API Key，不消耗体验额度。

## 升级触发原则

升级提示只出现在用户已经表达需求的时刻：

- 专有名词识别不准：说明 Pro 的云端识别与热词。
- 长语音只能基础清理：先给本地结果，再提供智能整理。
- 当前聊天需要 OCR / LLM：提供情境代回体验。
- 跨应用、多步骤任务：展示 Ultra 的执行价值。

任何提示都不能阻断本地结果；同类提示需要冷却并允许关闭。

## 与执行 Tier 的区别

产品版本使用 `planTier: free | pro | ultra`。

Runtime 内的 Tier 0 / Tier 1 / Tier 2 是执行路由（Compiled Skill / Plan & Execute / ReAct），不是会员等级。两者必须保持独立命名。

## 当前实现状态

- 已实现权益解析、体验额度、BYOK 与设置展示。
- 已实现本地 Whisper 的 Electron Main 推理入口，使用 GGML 模型路径。
- `local-funasr` provider 已预留；当前以 Whisper 作为本地备份。
- 支付、账号、远端 entitlement 签名和云端热词下发尚未实现。
