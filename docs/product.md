# Fold Runtime — 产品文档

> **Your Local AI Runtime.**  
> AI that understands your computer.

---

## 1. 产品定位

Fold Runtime 不是聊天机器人，而是运行在用户电脑上的 **本地 Context Agent / AI Runtime**。

它持续感知电脑发生的事情（Context），在用户需要时完成复杂任务（Execution），并逐渐形成长期工作记忆（Memory）。

```
Fold ≠ Recording
Fold = Context Indexing + Skill Execution
```

### 1.1 一句话定义

> **一个本地 Context Runtime，不持续依赖 LLM，而是利用 OS Events + Context Engine + Skills Runtime，在需要时调用 AI，帮助用户完成整个电脑上的任务。**

### 1.2 与竞品的差异

| 维度 | 传统 Chat Agent | Computer Use Agent | Fold Runtime |
|------|----------------|-------------------|--------------|
| 交互 | 聊天窗口 | 聊天 + 屏幕操作 | 胶囊 Overlay，无聊天 |
| 上下文 | 用户手动粘贴 | 截图 / OCR | OS Events 事件索引 |
| 执行 | 每步 LLM 推理 | 截图 → 点击循环 | Plan 一次 → 确定性执行 |
| 记忆 | 会话历史 | 无 | Live Context + Episode + Memory |
| 速度 | 慢 | 很慢（视觉驱动） | 快（API / Script 优先） |
| 扩展 | Prompt | 无 | Skills Marketplace |

### 1.3 在 Fold 生态中的位置

Fold Runtime 不是独立产品，而是 **Fold 的执行层**：

```
                Fold
                   │
    ┌──────────────┼──────────────┐
    │              │              │
 Fold Skills   Fold Runtime   Fold Memory
   能力市场        本地执行         长期记忆
                   │
             Context Engine
                   │
            Connector Layer
      API / MCP / Shell / GUI
```

任何一个 Fold Skill 不仅仅是一个 Prompt，而是一个**真正可以在本地执行、理解上下文、调用应用完成任务的 AI 能力包**。

---

## 2. 产品目标

### 2.1 Demo 目标（2~3 周）

验证三个核心能力：

- ✅ 理解电脑 Context
- ✅ 理解自然语言
- ✅ 自动完成一个完整任务

**Demo 标准任务：**

> "帮我整理刚下载的报价，发给 Jason。"

完整链路：

```
用户下载 quote.pdf
  → Fold 监听到 Downloads 新文件
  → 用户按住 ⌥ Space 说话
  → Fold 展示真实执行步骤
  → 读取 PDF → 提取字段 → 创建邮件草稿
  → 记录 Episode → Done
```

### 2.2 长期目标

- 成为 macOS 上最自然的 AI 操作入口
- 支撑 Fold Skills Marketplace 的本地执行
- 形成 Context + Memory 的长期壁垒

---

## 3. 核心概念

### 3.1 Context Engine（上下文引擎）

Fold 的核心资产。不持续截图，而是监听系统事件：

```
Chrome Active → URL Changed → Clipboard Changed
  → Finder Open → File Downloaded → Mail Opened
```

形成 **Live Context**（最近 30 分钟的活动快照）。

### 3.2 Live Context

短期上下文，自动过期（30 分钟）：

```
Chrome:    OpenAI Pricing
Finder:    Quote.pdf
Clipboard: API Price $12,000
Mail:      Jason Chen
```

### 3.3 Episode

一次任务完成后自动生成的结构化记录：

```
时间:    10:30
目标:    更新报价
涉及:    Chrome, PDF, Mail
结果:    创建邮件草稿，提取 3 个字段
```

### 3.4 Memory

只有真正值得长期保存的信息：

```
用户偏好 Claude
用户每天回复 Jason
Fold 项目相关文件
```

### 3.5 Skills

稳定的能力抽象，Planner 只调用 Skill，不关心底层实现：

```
pdf.read()
mail.draft()
finder.latestDownload()
browser.currentPage()
```

### 3.6 Connectors

Skill 的底层执行器，按速度优先级路由：

```
有 API？        → REST API
是浏览器？      → Playwright / CDP
是系统应用？    → AppleScript
都没有？        → Accessibility
最后兜底？      → Vision / UI-TARS
```

---

## 4. 执行模型

### 4.1 三层执行路由

| 层级 | 名称 | LLM 调用 | 适用场景 | Demo |
|------|------|----------|----------|------|
| Tier 0 | Compiled Skill | 0 次 | 高频固定任务 | 第二阶段 |
| Tier 1 | Plan & Execute | 1 次 | 主路径，结构化任务 | **必须做** |
| Tier 2 | ReAct / GUI | N 次 | 兜底，无 API 的 GUI | 留接口 |

### 4.2 执行流程

```
用户意图 + Live Context
  ↓
Orchestrator（主 Agent）
  ↓
Planner → ActionPlan（JSON，一次性）
  ↓
Executor（确定性执行，不调 LLM）
  ↓
逐步轻量检查
  ↓
失败？→ Retry / Replan Step / Repair Sub-agent / 问用户
  ↓
Validator（整体结果校验）
  ↓
Done → 记录 Episode
```

### 4.3 失败恢复策略

| 失败类型 | 处理方式 | 是否调 LLM |
|----------|----------|-----------|
| Retryable | 自动重试 1~2 次 | 否 |
| Replan Step | 局部重规划当前 step | 1 次小调用 |
| Explore | 启动 scoped Repair Sub-agent | 小范围 ReAct |
| Human Required | 暂停，Overlay 询问用户 | 否 |

核心原则：

> **默认快路径，失败时局部变聪明，不要全局变笨。**

---

## 5. MVP 功能范围

### 5.1 第一版（Demo）

| 模块 | 能力 |
|------|------|
| Context | App 切换、Downloads、Clipboard、Chrome URL |
| Skills | `finder.latestDownload`, `pdf.extract`, `mail.draft` |
| Connectors | AppleScript, Shell, PDF parser |
| UI | Overlay 胶囊、快捷键、状态流转 |
| Memory | Live Context + Episode（SQLite） |
| Voice | 阿里云 ASR（复用 supa-man，见 `docs/reuse-from-supa-man.md`） |

### 5.2 第二版

- Notion、Slack、飞书
- Compiled Skill（Tier 0）
- Skills Marketplace 接入

### 5.3 第三版

- Excel、Word、PowerPoint、Figma、GitHub
- UI-TARS / Accessibility 兜底（Tier 2）
- 向量 Memory

---

## 6. 非目标（Demo 阶段不做）

- ❌ 持续屏幕录制 / OCR
- ❌ 通用 Computer Use 主路径
- ❌ 聊天窗口
- ❌ 复杂 multi-agent 协作
- ❌ Windows / Linux 支持
- ❌ 云端同步

---

## 7. 成功指标

### Demo 录屏标准（40 秒）

```
⌥ Space → 说话 → 实时字幕
  → Reading PDF → Creating Mail Draft → Done
```

### 量化指标

| 指标 | 目标 |
|------|------|
| 端到端延迟（Tier 1 任务） | < 5 秒 |
| LLM 调用次数（主路径） | ≤ 2 次（Planner + 可选 Validator） |
| Context 事件延迟 | < 500ms |
| Overlay 唤醒延迟 | < 200ms |

---

## 8. 技术路线一句话

> **Build a Local AI Runtime on top of existing Computer Use frameworks, instead of building another Computer Use framework.**

翻译：

> **不要重复造 GUI Agent，而是在成熟的 Computer Use 框架之上，构建自己的 Context、Memory、Planner 和 Skills。**
