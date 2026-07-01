# 从 supa-man 复用 — 语音 & UI

> **源项目路径：** `/Users/littleyang/Desktop/supa-man`  
> supa-man（SupaMind）里已有完整的阿里云 ASR 链路、录音 UI、波形动画和流动边框效果。Fold Runtime Demo 应**直接迁移**，不要重写。

---

## 1. 复用总览

| Fold 模块 | supa-man 源文件 | 迁移方式 |
|-----------|-----------------|----------|
| ASR 代理服务 | `apps/asr-proxy/` | 迁入或 Electron 内嵌 session 逻辑 |
| ASR 客户端 | `apps/mobile/src/services/asr.ts` | → `packages/voice/src/aliyun-asr.ts` |
| PCM 采集 | `apps/mobile/src/static/asr-pcm-worklet.js` | 原样复制到 desktop public |
| 音频电平 | `apps/mobile/src/utils/audioLevel.ts` | → `packages/voice/src/audio-level.ts` |
| 波形 UI | `apps/mobile/src/components/asr/VoiceWaveform.vue` | 改写为 React `VoiceWaveform.tsx` |
| 流动边框 | `CaptureSheet.vue` 内 `.rec-bar.processing::before` | → `GradientBorder.tsx` |
| 集成文档 | `docs/ASR-INTEGRATION.md` | 参考，Fold 内链本文档 |

**不直接复用（业务不同）：**

- `apps/asr-proxy/src/persist.ts` — supa-man 的 Capture 落库，Fold 改为触发 Orchestrator
- `apps/mobile/src/components/CaptureSheet.vue` 整体 — 记一笔业务 UI，只拆视觉部分

---

## 2. 阿里云 ASR 架构（supa-man 已实现）

```
Electron Renderer (Fold Overlay)
  │  getUserMedia → AudioContext(16k) → AudioWorklet → PCM 二进制帧
  │  wss /asr/stream
  ▼
asr-proxy (Node, :3003)  或  Electron Main 内嵌同等逻辑
  │  bearer DASHSCOPE_API_KEY（key 不出客户端）
  │  wss DashScope Realtime
  ▼
阿里云百炼 fun-asr-realtime
  │  partial / final / done
  ▼
Fold: onPartial → Overlay 字幕；done → Orchestrator.run()
```

### 2.1 核心文件

| 文件 | 作用 |
|------|------|
| `apps/asr-proxy/src/server.ts` | HTTP + WS 入口，`/asr/stream` |
| `apps/asr-proxy/src/session.ts` | 客户端 WS ↔ DashScope 上游会话 |
| `apps/asr-proxy/src/dashscope.ts` | 阿里云 WS 协议封装 |
| `apps/mobile/src/services/asr.ts` | 前端：麦克风 + Worklet + WS 客户端 |
| `apps/mobile/src/static/asr-pcm-worklet.js` | float32 → int16，worklet 线程 |
| `docs/ASR-INTEGRATION.md` | 完整协议、环境变量、部署说明 |

### 2.2 环境变量（与 supa-man 一致）

```bash
DASHSCOPE_API_KEY="sk-..."
DASHSCOPE_ASR_MODEL="fun-asr-realtime"
DASHSCOPE_WS_URL="wss://dashscope.aliyuncs.com/api-ws/v1/inference"
ASR_PROXY_PORT="3003"
```

Fold Desktop 开发时可二选一：

1. **独立进程**：本地跑 `asr-proxy`（与 supa-man 相同），Electron 连 `ws://localhost:3003/asr/stream`
2. **内嵌 Main**：把 `session.ts` + `dashscope.ts` 迁入 Electron main，Renderer 走 IPC 推 PCM（生产更干净）

Demo 推荐 **方案 1**，迁移成本最低。

### 2.3 WebSocket 协议（client ↔ proxy）

详见 supa-man `docs/ASR-INTEGRATION.md` §四。

**客户端发送：**

```json
{ "type": "start", "sampleRate": 16000, "format": "pcm", "languageHints": ["zh","en"], "model": "fun-asr-realtime" }
```
→ 二进制 PCM 块 → `{ "type": "finish" }` 或 `{ "type": "abort" }`

**代理返回：**

| 事件 | Fold 用途 |
|------|-----------|
| `partial` | `fold:transcript` → Listening 实时字幕 |
| `final` | 句末更新字幕 |
| `done` | `fullText` → 松开快捷键 → `Orchestrator.run()` |
| `error` | Overlay `error` 状态 |

### 2.4 Fold Voice Adapter 接口

```typescript
// packages/voice/src/types.ts
export interface VoiceAdapter {
  start(opts: {
    onPartial: (text: string) => void
    onError?: (err: Error) => void
  }): Promise<void>

  stop(): Promise<string>   // fullText
  cancel(): void
}

// packages/voice/src/aliyun-asr.ts
// 从 supa-man apps/mobile/src/services/asr.ts 迁移
// 改动点：
//   - 去掉 ownerId / captureItemId / persist 相关字段
//   - start 不再写 supa-man DB
//   - done 只返回 fullText
```

### 2.5 supa-man 与 Fold 的差异

| 项 | supa-man | Fold |
|----|----------|------|
| 触发方式 | 点按录音按钮 | 按住 `⌥ Space` |
| 结束后 | 写入 Capture + Memory | `Orchestrator.run(intent, liveContext)` |
| 热词 | `fetchHotWords()` 实体名 | 可选：Live Context 联系人/项目名 |
| 落库 | `persist.ts` 写 CaptureItem | Fold Episode（任务完成后） |

---

## 3. UI 复用（录音 & 流动效果）

### 3.1 波形组件 — `VoiceWaveform.vue`

**源：** `apps/mobile/src/components/asr/VoiceWaveform.vue`

特点（可直接保留到 React 版）：

- 42 根 bar，~95ms tick，向左滚动
- `level` 0~1 驱动高度，`smoothAudioLevel` 平滑
- 两端 `mask-image` 羽化
- 静音时 hairline 中线

**Fold 目标：** `apps/desktop/src/overlay/components/VoiceWaveform.tsx`

```tsx
// props
{ level: number; active: boolean }

// 依赖
import { smoothAudioLevel, pcm16AudioLevel } from '@fold/voice/audio-level'
```

### 3.2 音频电平 — `audioLevel.ts`

**源：** `apps/mobile/src/utils/audioLevel.ts`

| 函数 | 用途 |
|------|------|
| `audioFrameLevel()` | 通用帧（App 编码流） |
| `pcm16AudioLevel()` | Electron Worklet 的 raw PCM |
| `smoothAudioLevel()` | UI 平滑，避免波形跳变 |

Fold Electron 用 **`pcm16AudioLevel`** + Worklet 输出。

### 3.3 流动边框 — `asr-border-flow`

**源：** `apps/mobile/src/components/CaptureSheet.vue`（约 L3075–3163）

录音识别中（`recAsrState === 'transcribing'`）的胶囊边框：

```scss
/* 核心：渐变 border + mask 镂空 + background-position 动画 */
.rec-bar.processing::before {
  background: linear-gradient(115deg, #ff5f6d, #ffc371, #47e6b1, #4facfe, #a78bfa, #ff5f6d);
  background-size: 260% 100%;
  animation: asr-border-flow 2.4s ease-in-out infinite;
}
@keyframes asr-border-flow {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

**Fold 映射：**

| supa-man 状态 | Fold Overlay 状态 |
|---------------|-------------------|
| `recording` + 波形 | `listening` |
| `transcribing` + 流动边框 | `understanding`（松开快捷键后、Planner 前） |
| — | `working`（执行步骤列表，Fold 独有） |

**Fold 目标：** `apps/desktop/src/overlay/components/GradientBorder.tsx`

Listening 用流动边框；Working 可改用静态边框或步骤 tick 动画。

### 3.4 CaptureSheet 录音条布局（参考）

```
[ ● ] [ 0:12 ] [ ~~~~~~~~波形~~~~~~~~ ] [取消] [完成]
```

Fold Idle/Listening 简化为：

```
╭──────────────────────────────────────────╮
│  🎤  帮我整理刚下载的报价...    ～波形～  │
╰──────────────────────────────────────────╯
```

不需要「取消/完成」按钮——**松开快捷键 = 完成**，`Escape` = 取消。

---

## 4. Fold 接入流程（建议顺序）

### Step 1：复制 ASR 底层（Day 1）

```bash
# 从 supa-man 复制
apps/asr-proxy/src/{session,dashscope}.ts  → packages/voice/src/proxy/
apps/mobile/src/services/asr.ts             → packages/voice/src/aliyun-asr.ts
apps/mobile/src/static/asr-pcm-worklet.js     → apps/desktop/public/asr-pcm-worklet.js
apps/mobile/src/utils/audioLevel.ts           → packages/voice/src/audio-level.ts
```

本地 dev：继续用 supa-man 的 `pnpm asr:dev` 或 Fold 自己的 asr-proxy 子包。

### Step 2：Overlay 语音 UI（Day 1–2）

- `VoiceWaveform.tsx` ← Vue 版逻辑
- `GradientBorder.tsx` ← `asr-border-flow` CSS
- `ListeningPill.tsx` ← 组合波形 + 实时字幕
- `useVoice.ts` ← 封装 `startAlibabaAsr` + hotkey 按住/松开

### Step 3：接 Runtime（Day 2–3）

```
松开 hotkey
  → voiceAdapter.stop() → fullText
  → ipc: fold:voice-end
  → Orchestrator.run(fullText, liveContext)
  → fold:state working → done
```

### Step 4：去掉 supa-man 特有逻辑

- 删除 `ownerId` / `profileId` / `captureWrite`
- 热词可选改为 Fold Live Context 里的联系人名
- `VITE_ASR_PROVIDER=mock` 保留，方便无 key 开发

---

## 5. 与 supa-man runtimed 的关系

supa-man 还有 Mac 本地 daemon：`packages/rma-mcp-supamind/src/runtime/runtimed.ts`  
通过 `apps/asr-proxy/src/runtimeRelay.ts` 反连 ECS，执行本地 Agent 任务。

**Fold 不直接复用 runtimed**，原因：

- runtimed 面向 SupaMind Chat / Codex CLI 回流
- Fold 需要自己的 Orchestrator + Skills + Context Engine

可借鉴的模式：

- Mac **出站 WS 反连**（无公网 IP 也能收任务）
- 本地 daemon 常驻

Fold 若以后需要「手机发任务、Mac 执行」，可参考 `runtimeRelay` 设计，但 Demo 阶段不需要。

---

## 6. Checklist

### ASR

- [ ] 复制 `asr.ts` + worklet + proxy session
- [ ] Fold Settings 配置 `DASHSCOPE_API_KEY`
- [ ] `onPartial` → `fold:transcript`
- [ ] `stop()` → `Orchestrator.run()`
- [ ] mock 模式保留

### UI

- [ ] `VoiceWaveform.tsx` 迁移
- [ ] `GradientBorder.tsx` 迁移 `asr-border-flow`
- [ ] `pcm16AudioLevel` 接 Worklet
- [ ] Listening / Understanding 状态绑定

### 不迁移

- [ ] CaptureSheet 业务逻辑
- [ ] ASR persist 写 CaptureItem
- [ ] runtimed / runtimeRelay（Demo 不需要）

---

## 7. 相关文档

- supa-man：`docs/ASR-INTEGRATION.md`
- Fold：`docs/integrations.md`
- Fold UI：`docs/ui.md`
- Fold 架构：`docs/architecture.md` §8 IPC
