# 本地模型测试计划

> 目标：明天验证本地模型能否把短按净化、长按代回、ASR 延迟压到可用范围。

## LLM

- 给轻量场景单独加快模型配置：`FOLD_FAST_MODEL`。
- 短按右⌘“净化”优先本地规则；复杂句才走 fast LLM。
- 长按右⌘“代回”走 fast LLM，不复用 `FOLD_PLANNER_MODEL`。
- Agent 规划继续使用 `FOLD_PLANNER_MODEL`，不和轻量输入共用。
- 对比候选：
  - 本地小模型：优先测低延迟中文对话/改写模型。
  - 云端快模型：保留作 baseline，例如 `gpt-4o-mini` / `gemini flash` / `haiku` 类。
- 验证样例：
  - 短按净化：`呃，我一会儿回家啊` → 私聊保留自然语气，邮件去口语。
  - 长按代回：结合微信截图/聊天上下文，按“拒绝一下 / 同意一下 / 幽默回一下”生成自然回复。

## ASR

- 免费版默认本地：目标架构为 FunASR 主、Whisper 备。
- 付费版 / 升级版默认 DashScope 云端；断网或失败时回落本地。
- 当前第一阶段先跑通 Whisper GGML（Electron Main 托管推理），FunASR 复用 provider 接口接入。
- 继续测试 DashScope 当前链路，确认 `finish` 后 1.5s timeout 的体感。
- 测本地 ASR，目标是松开后 1-2s 内有最终文本。
- 保留当前音波 UI：录音中不展示实时字幕，只展示音量波形。
- 对比指标：
  - 首次启动耗时。
  - 松开到文本可用耗时。
  - 中文口语准确率。
  - 是否支持流式 partial，便于未来边说边预处理。

## 预期改动

- `packages/ai/src/types.ts`：新增 fast model role 或 `FOLD_FAST_MODEL` 解析。
- `packages/ai/src/structure-speech.ts`：复杂净化走 fast model。
- `packages/ai/src/predict-drafts.ts`：代回走 fast model。
- `packages/voice` / `apps/asr-proxy`：抽象 ASR provider，方便 DashScope 与本地 ASR 切换。
- `apps/desktop/electron/local-whisper.ts`：缓冲 PCM，在 Electron Main 中串行执行 whisper.cpp。
- `FOLD_LOCAL_WHISPER_MODEL_PATH`：本地 GGML 模型路径；建议从 `small` 中文样例开始验证。

## 版本验收

- Free：无云端 Key 也能使用本地 ASR、Context 和基础净化。
- Pro：云端 ASR、复杂净化、情境代回与 OCR 可用。
- Ultra：在 Pro 基础上开放跨应用 Agent、Subagent 和高级恢复。
- 新用户 20 次智能体验成功后扣减；失败不扣；BYOK 不扣。

