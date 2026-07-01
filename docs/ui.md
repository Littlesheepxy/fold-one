# Fold Runtime — UI 设计文档

---

## 1. 设计原则

### 1.1 核心原则

| 原则 | 说明 |
|------|------|
| 不打扰 | Idle 状态几乎不可见，只有一个胶囊 |
| 不抢焦点 | Overlay 浮在所有窗口上，但不激活、不抢输入 |
| 不聊天 | 没有聊天窗口，只有状态 + 步骤 |
| 真实步骤 | 展示 "Reading PDF"，不是 "Thinking..." |
| 快速消失 | 完成后 2 秒自动收起 |

### 1.2 参考产品

交互模式参考（不照搬）：

- **Raycast**：快捷键唤醒、命令栏
- **Wispr Flow / Superwhisper**：按住说话、实时字幕、胶囊 Overlay
- **Koe / SFlow**：Non-activating NSPanel、底部居中胶囊

### 1.3 自有 UI 复用

- **流动边框**：Listening 状态渐变边框动画，复用你之前项目中的实现（迁入 `GradientBorder` 组件）
- **语音识别 UI**：实时字幕宽度增长 + 超宽左滚，与阿里云 ASR 的 partial 流对接

### 1.3 设计约束

- 无 Dock icon（`LSUIElement=1`），仅 Menu Bar 常驻
- 无传统主窗口
- 所有交互通过 Overlay + 快捷键完成
- Settings 为可选独立窗口，非常驻

---

## 2. 状态机

```
                    ┌─────────┐
                    │  Idle   │ ←──────────────────┐
                    └────┬────┘                    │
                         │ ⌥ Space (hold)           │
                         ▼                          │
                  ┌─────────────┐                   │
                  │  Listening  │                   │
                  └──────┬──────┘                   │
                         │ release hotkey           │
                         ▼                          │
                ┌─────────────────┐                 │
                │  Understanding  │                 │
                └────────┬────────┘                 │
                         │ plan ready               │
                         ▼                          │
                  ┌─────────────┐                   │
                  │  Planning   │ (可选，步骤预览)   │
                  └──────┬──────┘                   │
                         │                          │
                         ▼                          │
                  ┌─────────────┐                   │
                  │   Working   │                   │
                  └──────┬──────┘                   │
                         │                          │
              ┌──────────┼──────────┐               │
              ▼          ▼          ▼               │
        ┌─────────┐ ┌─────────┐ ┌─────────┐        │
        │  Done   │ │  Error  │ │  Ask    │────────┘
        └─────────┘ └─────────┘ └─────────┘
              │          │          │
              └──────────┴──────────┘
                    2s 后 → Idle
```

### 状态定义

| 状态 | 触发 | 用户感知 | 持续时间 |
|------|------|----------|----------|
| `idle` | 默认 | 底部小胶囊 "○ Fold" | 常驻 |
| `listening` | 按住快捷键 | 实时语音字幕 + 渐变边框 | 按住期间 |
| `understanding` | 松开快捷键 | "Understanding..." + 进度条 | < 2s |
| `planning` | Plan 生成中 | 步骤预览（可选） | < 1s |
| `working` | 执行中 | 逐步打勾 + 当前控制的应用 | 2~10s |
| `done` | 成功 | 绿色 Done + 结果摘要 | 2s 后消失 |
| `error` | 失败 | 错误信息 + Retry 按钮 | 用户操作或 5s |
| `ask` | 需要用户选择 | 选项列表 | 等待用户 |

---

## 3. 视觉规格

### 3.1 胶囊（Pill）

```
位置:     屏幕底部居中，距底边 14px
形状:     圆角胶囊（border-radius: 9999px）
背景:     NSVisualEffectView / backdrop-blur + 半透明
尺寸:
  - Idle:      高度 36px，宽度自适应（logo only ~80px）
  - Listening: 高度 44px，宽度随文字增长（最大屏宽 - 48px）
  - Working:   高度 44px，宽度 320~480px
  - Done:      高度 36px，宽度自适应
层级:     always-on-top, non-activating
```

### 3.2 颜色

```
背景:         rgba(0, 0, 0, 0.6) + backdrop-blur(20px)
边框 Idle:    rgba(255, 255, 255, 0.1)
边框 Listening: 渐变流动动画（蓝 → 紫 → 蓝，3s loop）
文字:         rgba(255, 255, 255, 0.9)
步骤完成:     #34D399（green-400）
步骤进行中:   rgba(255, 255, 255, 0.7) + spinner
步骤等待:     rgba(255, 255, 255, 0.3)
错误:         #F87171（red-400）
Done:         #34D399
```

### 3.3 动画

| 元素 | 动画 | 参数 |
|------|------|------|
| 胶囊展开 | width spring | stiffness: 300, damping: 30 |
| 边框流动 | gradient rotate | 3s linear infinite |
| 步骤打勾 | scale + fade in | 200ms ease-out |
| 字幕增长 | width spring | 不收缩（session 内只增不减） |
| 字幕滚动 | translateX | 超宽后开始左滚 |
| 出现/消失 | opacity + translateY | 150ms ease, Y: 8px |
| Done 收起 | opacity fade out | 2s delay → 300ms fade |

使用 **Framer Motion** 实现。

---

## 4. 各状态 UI 详述

### 4.1 Idle

```
────────────────────────────────

            ○ Fold

────────────────────────────────
```

- 最小化存在感
- 可选：极淡呼吸动画（opacity 0.3 ↔ 0.5，4s）
- 不响应鼠标事件（`pointer-events: none`）

### 4.2 Listening

按住 `⌥ Space`：

```
╭──────────────────────────────────────────╮
│  🎤  帮我整理刚下载的报价...              │
╰──────────────────────────────────────────╯
```

行为：

- 边框缓慢流动（渐变动画）
- 文字实时追加（来自语音识别流）
- 宽度随文字增长
- 达到最大宽度后开始向左滚动
- 可选：底部音频波形条（3~5 根竖条，高度随音量变化）

### 4.3 Understanding

松开快捷键：

```
╭──────────────────────────────────────────╮
│  Understanding...                          │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░                  │
╰──────────────────────────────────────────╯
```

- 播放短促提示音（"滴"）
- 进度条 indeterminate 动画
- 持续 < 2 秒

### 4.4 Planning（可选展示）

```
╭──────────────────────────────────────────╮
│  ✓ Found PDF                             │
│  ✓ Reading quote                         │
│  ○ Creating mail draft                   │
╰──────────────────────────────────────────╯
```

- 展示 Planner 输出的步骤预览
- 已规划的步骤显示 ✓（灰色）
- 当前步骤高亮

### 4.5 Working

```
╭──────────────────────────────────────────╮
│  ✓ Found quote.pdf                       │
│  ✓ Reading PDF                           │
│  ◌ Creating mail draft                   │
│                                          │
│  Fold 正在控制：Mail                     │
╰──────────────────────────────────────────╯
```

行为：

- 每完成一步，打勾动画（200ms）
- 当前步骤显示 spinner（◌）
- 底部显示当前控制的应用名称
- 步骤从 Runtime 事件流实时推送

### 4.6 Done

```
╭──────────────────────────────────────────╮
│  ✓ Mail Draft Ready                      │
│    3 fields extracted                    │
╰──────────────────────────────────────────╯
```

- 绿色 ✓
- 结果摘要（1 行）
- 2 秒后自动 fade out 回到 Idle

### 4.7 Error

```
╭──────────────────────────────────────────╮
│  ✗ Could not find Jason                  │
│    [ Retry ]  [ Cancel ]                 │
╰──────────────────────────────────────────╯
```

- 红色错误信息
- 提供 Retry / Cancel 按钮
- 5 秒无操作自动 Cancel

### 4.8 Ask（需要用户输入）

```
╭──────────────────────────────────────────╮
│  找到 2 个 Jason：                        │
│    → Jason Chen (Mail)                   │
│    → Jason Wang (Contacts)               │
╰──────────────────────────────────────────╯
```

- 选项可点击（需要 `ClickablePanel` 或 hover 高亮 + 快捷键选择）
- 点击后不抢焦点，结果交回 Runtime

---

## 5. 快捷键

| 快捷键 | 动作 | 模式 |
|--------|------|------|
| `⌥ Space`（按住） | 开始录音 | Push-to-talk |
| 松开 `⌥ Space` | 结束录音，开始执行 | — |
| `⌥ Space`（双击） | Toggle 录音 | Hands-free |
| `Escape` | 取消当前操作 | 任何非 Idle 状态 |

快捷键可通过 Settings 自定义。

---

## 6. Menu Bar

```
┌─────────────────────────┐
│ ○ Fold                  │
│ ─────────────────────── │
│ Recent Episodes         │
│   · 更新报价 → Mail      │
│   · 整理会议纪要          │
│ ─────────────────────── │
│ Settings...             │
│ Quit Fold               │
└─────────────────────────┘
```

- 模板图标（适配 Light/Dark mode）
- Recent Episodes 列表（最近 5 条）
- Settings 打开独立窗口

---

## 7. Settings 窗口

仅在用户主动打开时出现：

```
┌─ Fold Settings ──────────────────────┐
│                                     │
│  General                            │
│    ☐ Launch at login               │
│    Hotkey: [ ⌥ Space ]             │
│                                     │
│  Voice                              │
│    Provider: [ 已有方案 ▾ ]         │
│    Language: [ Auto ▾ ]            │
│                                     │
│  AI                                 │
│    Provider: [ Claude ▾ ]          │
│    Model:    [ claude-sonnet ▾ ]    │
│                                     │
│  Context                            │
│    ☑ App switching                 │
│    ☑ Clipboard                     │
│    ☑ Downloads folder              │
│    ☑ Browser URL                   │
│    Live Context TTL: [ 30 min ]    │
│                                     │
│  Permissions                        │
│    Accessibility:  ✓ Granted     │
│    Microphone:      ✓ Granted     │
│                                     │
└─────────────────────────────────────┘
```

---

## 8. 技术实现要点

### 8.1 窗口类型

```typescript
// Electron 侧
const overlayWindow = new BrowserWindow({
  type: 'panel',           // macOS NSPanel
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  focusable: false,        // 不抢焦点
  skipTaskbar: true,
  hasShadow: false,
  webPreferences: {
    preload: '...',
  },
})
```

### 8.2 状态管理

```typescript
// Zustand store
interface OverlayState {
  status: 'idle' | 'listening' | 'understanding' | 'planning' | 'working' | 'done' | 'error' | 'ask'
  transcript: string        // 实时语音字幕
  steps: Step[]             // 执行步骤
  currentApp: string | null // 当前控制的应用
  result: string | null     // 结果摘要
  error: string | null
  askOptions: AskOption[]   // 用户选择项
}
```

### 8.3 Runtime → UI 事件流

```typescript
// Main process → Renderer
ipcMain → overlayWindow.webContents.send('fold:state', {
  status: 'working',
  steps: [
    { id: '1', label: 'Found quote.pdf', status: 'done' },
    { id: '2', label: 'Reading PDF', status: 'done' },
    { id: '3', label: 'Creating mail draft', status: 'running' },
  ],
  currentApp: 'Mail',
})
```

### 8.4 响应式宽度

```typescript
// 字幕宽度逻辑
const MIN_WIDTH = 80     // Idle
const MAX_WIDTH = screenWidth - 48
// Listening 时：width = clamp(textWidth + padding, MIN_WIDTH, MAX_WIDTH)
// 超过 MAX_WIDTH 时：text 容器 overflow hidden + translateX 左滚
```

---

## 9. 组件结构

```
apps/desktop/src/
├── overlay/
│   ├── OverlayApp.tsx          # 根组件，状态机驱动
│   ├── states/
│   │   ├── IdlePill.tsx
│   │   ├── ListeningPill.tsx
│   │   ├── UnderstandingPill.tsx
│   │   ├── WorkingPill.tsx
│   │   ├── DonePill.tsx
│   │   ├── ErrorPill.tsx
│   │   └── AskPill.tsx
│   ├── components/
│   │   ├── StepList.tsx        # 步骤列表 + 打勾动画
│   │   ├── Transcript.tsx      # 实时字幕
│   │   ├── GradientBorder.tsx  # 流动边框
│   │   ├── ProgressBar.tsx
│   │   └── AudioBars.tsx       # 音频波形（可选）
│   └── hooks/
│       ├── useOverlayState.ts  # Zustand store
│       └── useFoldEvents.ts    # IPC 事件监听
├── menubar/
│   └── MenuBarApp.tsx
└── settings/
    └── SettingsApp.tsx
```

---

## 10. 无障碍 & 国际化

- 所有状态变化通过 Accessibility API 通知（`NSAccessibilityNotification`)
- 支持中英文界面（Demo 阶段中文优先）
- 高对比度模式下边框和文字自动调整
