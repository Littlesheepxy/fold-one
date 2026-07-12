# 本地模型测试计划

> 转写净化、代回草案已拆到 **Fast LLM**；Agent 规划仍用 **Planner LLM**。

## LLM 分工（已实现）

| 场景 | 模型角色 | 环境变量 | 默认（OpenRouter） |
|------|----------|----------|-------------------|
| 右 ⌘ 短按 · 复杂转写净化 | `fast` | `FOLD_FAST_*` | `google/gemini-3.1-flash-lite` |
| 右 ⌘ 按住 · 代回草案 | `fast` | `FOLD_FAST_*` | 同上 |
| ⌥ Space · Agent 规划 | `planner` | `FOLD_PLANNER_*` | `openai/gpt-5.5` |
| 短句转写 | 无 LLM | — | 本地规则 `shouldCleanSpeechLocally` |

### 选型依据（2026）

- **Gemini 3.1 Flash-Lite**（OpenRouter `google/gemini-3.1-flash-lite`）：2026 GA，低延迟、高吞吐，优于 2.5 Flash-Lite。
- **GPT-5.5**（Planner）：Agent 规划专用，不与转写/代回共用。
- **qwen-flash**（DashScope）：国内延迟低，与现有 `DASHSCOPE_API_KEY` / ASR 同栈。

### 配置示例

```bash
# Agent 用强模型
FOLD_PLANNER_PROVIDER=openrouter
FOLD_PLANNER_MODEL=openai/gpt-5.5

# 语音场景用 Gemini 3.1 Flash-Lite
FOLD_FAST_PROVIDER=openrouter
FOLD_FAST_MODEL=google/gemini-3.1-flash-lite
```

仅 DashScope：

```bash
FOLD_FAST_PROVIDER=dashscope
FOLD_FAST_MODEL=qwen-flash
```

设置 → 高级 → **Fast Provider / Fast Model** 可覆盖。

## ASR

- 免费版默认本地 Whisper；Pro 默认 DashScope 云端。
- 详见上文历史记录与 `packages/voice`。

## 代码入口

- `packages/ai/src/model-choice.ts` — `resolveModelChoice("fast" | "planner")`
- `packages/ai/src/fast-text.ts` — `generateFastText`（限制 `maxOutputTokens`）
- `packages/ai/src/structure-speech.ts` — 复杂净化走 fast
- `packages/ai/src/predict-drafts.ts` — 代回走 fast
