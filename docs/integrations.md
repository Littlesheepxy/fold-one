# Fold Runtime — 集成清单

> 本文档汇总需要接入的**自有实现**、**开源项目**和**第三方服务**，以及各模块在 Demo 阶段的优先级。

---

## 1. 总览

```
Fold Runtime
├── 自有复用（supa-man 已有，见 reuse-from-supa-man.md）
│   ├── 阿里云 ASR：apps/asr-proxy + apps/mobile/src/services/asr.ts
│   ├── 波形 UI：VoiceWaveform.vue + audioLevel.ts
│   └── 流动边框：CaptureSheet.vue asr-border-flow
├── 自研（Fold 核心）
│   ├── Context Engine
│   ├── Planner / Executor / Orchestrator
│   ├── Skills + Memory
│   └── Overlay 状态机
└── 开源集成（Connector 层）
    ├── Playwright          ← 浏览器（Phase 2+）
    ├── UI-TARS Desktop     ← GUI 兜底（Phase 4）
    ├── Open Interpreter    ← Shell/Python（可选，Phase 3+）
    └── better-sqlite3 等   ← 基础设施
```

---

## 2. 自有复用 — supa-man ✅

> **详细路径与迁移步骤：** [`docs/reuse-from-supa-man.md`](./reuse-from-supa-man.md)

源项目：`/Users/littleyang/Desktop/supa-man`

### 2.1 阿里云语音识别

| 项 | supa-man 位置 |
|----|---------------|
| ASR 代理 | `apps/asr-proxy/`（`fun-asr-realtime`，DashScope WS） |
| 前端客户端 | `apps/mobile/src/services/asr.ts` |
| PCM Worklet | `apps/mobile/src/static/asr-pcm-worklet.js` |
| 集成文档 | `docs/ASR-INTEGRATION.md` |

Fold 接入：`packages/voice/`，松开快捷键 → `Orchestrator.run(fullText)`。

### 2.2 录音 UI + 流动边框

| 项 | supa-man 位置 |
|----|---------------|
| 波形动画 | `apps/mobile/src/components/asr/VoiceWaveform.vue` |
| 音频电平 | `apps/mobile/src/utils/audioLevel.ts` |
| 流动边框 CSS | `CaptureSheet.vue` → `asr-border-flow`（L3075–3163） |

Fold 接入：`VoiceWaveform.tsx` + `GradientBorder.tsx` + `ListeningPill.tsx`。

### 2.3 Voice Adapter 接口

```typescript
interface VoiceAdapter {
  start(opts: { onPartial: (text: string) => void }): Promise<void>
  stop(): Promise<string>
  cancel(): void
}
```

**IPC：**

```
partial → fold:transcript → Overlay
done    → fold:voice-end   → Orchestrator
```

---

## 3. 开源项目集成

### 3.1 按优先级

| 项目 | 角色 | Demo 需要？ | 集成方式 | 阶段 |
|------|------|-------------|----------|------|
| **Playwright** | 浏览器 Connector（CDP） | 否（Demo 不做 Airtable） | npm 依赖，`connectors/playwright` | Phase 3+ |
| **UI-TARS Desktop** | GUI 兜底 Connector | 否 | SDK / subprocess / git submodule | Phase 4 |
| **Open Interpreter** | Shell/Python 增强 | 可选 | CLI 或 API 调用 | Phase 3+ |
| **better-sqlite3** | Episode / Memory | 是 | npm 依赖 | Phase 1 |
| **chokidar** | Downloads 文件监听 | 是 | npm 依赖 | Phase 2 |
| **Zod** | Skill I/O 校验 | 是 | npm 依赖 | Phase 1 |
| **Framer Motion** | Overlay 动画 | 是 | npm 依赖 | Phase 1 |

### 3.2 Playwright

```
仓库: https://github.com/microsoft/playwright
许可: Apache 2.0
用途: Airtable / Notion / GitHub 等网页操作
Fold 层: Skill 不变，Connector 走 CDP
```

**Demo：** 不集成，只留 `connectors/playwright` 空壳 + 接口。

**后续示例：**

```typescript
// skill: browser.fillForm
// connector: playwright
await page.goto(url)
await page.fill('[data-testid=...]', value)
```

---

### 3.3 UI-TARS Desktop

```
仓库: https://github.com/bytedance/UI-TARS-desktop
许可: Apache 2.0
用途: 无 API / 无 DOM 时的 Vision + 鼠标键盘兜底
Fold 层: Repair Sub-agent 或 Tier 2 最后一路 Connector
```

**注意：**

- 不要当产品底座，只当 **Connector**
- 需要 VLM（本地 vLLM 或云端 API），Demo 可不启
- 可选：`vendor/ui-tars` git submodule，升级时 `git pull`

**集成形态（规划）：**

```typescript
// packages/connectors/src/uitars/index.ts
// 调用 UI-TARS GUIAgent 或 Desktop 暴露的 API（需对照官方 SDK）
interface UITarsConnector {
  execute(goal: string, budget: number): Promise<ConnectorResult>
}
```

---

### 3.4 Open Interpreter

```
仓库: https://github.com/OpenInterpreter/open-interpreter
用途: 复杂文件处理、Python 脚本、终端任务
Fold 层: `connectors/shell` 的增强，或独立 `connectors/interpreter`
```

**Demo：** `pdf.extract` 用简单 Python subprocess 即可，不必整包 Open Interpreter。

**何时上：** 需要「自然语言 → 临时 Python」而不是固定 Skill 时。

---

### 3.5 其他基础设施（npm，非 submodule）

| 包 | 用途 |
|----|------|
| `electron` | 桌面壳 + Overlay |
| `zustand` | Overlay 状态 |
| `better-sqlite3` | SQLite |
| `chokidar` | FSEvents 封装 |
| `framer-motion` | 动画（可与你的流动边框合并） |

---

## 4. Demo 阶段「要集成」vs「只留接口」

### ✅ Demo 必须

| 模块 | 来源 |
|------|------|
| 语音识别 | **阿里云（你现有项目）** |
| Overlay UI + 流动效果 | **你现有 UI + Framer Motion** |
| Mail / Finder | AppleScript（系统自带，无开源） |
| PDF 解析 | Python + pdfplumber/PyMuPDF（小脚本） |
| Context 监听 | chokidar + Electron/native |
| Memory | better-sqlite3 |

### ⏸ Demo 只留接口，不实现

| 模块 | 开源项目 |
|------|----------|
| 浏览器自动化 | Playwright |
| GUI 兜底 | UI-TARS |
| 复杂 Shell Agent | Open Interpreter |

---

## 5. 目录规划（vendor / 复用）

```
fold/
├── apps/desktop/
├── packages/
│   ├── voice/                 # 封装阿里云 ASR（从你项目迁入）
│   └── connectors/
│       ├── playwright/        # Phase 3
│       ├── uitars/            # Phase 4
│       └── shell/             # Demo: pdf 子进程
└── vendor/                    # 可选 git submodule
    ├── ui-tars/               # 仅 Phase 4 需要时再拉
    └── open-interpreter/      # 可选
```

---

## 6. 对接 checklist（supa-man → Fold）

详见 [`reuse-from-supa-man.md`](./reuse-from-supa-man.md) §6。

- [ ] 复制 ASR 客户端 + worklet + proxy（或 dev 时共用 supa-man asr-proxy）
- [ ] 迁移 VoiceWaveform + GradientBorder 到 React
- [ ] hotkey 按住/松开 替代 CaptureSheet 点按
- [ ] 去掉 Capture 落库，改为 Orchestrator

---

## 7. 相关文档

- 产品范围：`docs/product.md`
- UI 状态与动画：`docs/ui.md`
- 架构与 Connector 接口：`docs/architecture.md` §5
- **supa-man 复用清单：** `docs/reuse-from-supa-man.md`
