# Fold Runtime / 知更

Local Context Agent for macOS — 懂你正在做什么的语音输入与轻量执行。

面向用户的产品名是 **知更**；本仓库工程包名仍为 `@fold/*`。

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env and add keys (optional — works with mock ASR + mock planner without keys)
cp .env.example .env

# Terminal 1: ASR proxy (optional if using mock ASR)
pnpm asr:dev

# Terminal 2: Desktop app
pnpm desktop:dev

# Optional: marketing site
pnpm site:dev
```

## Usage（桌面快捷键）

| 操作 | 快捷键 |
|------|--------|
| 结构化输入 | **右 ⌘** 短按 |
| 情境代回 | **右 ⌘** 长按 |
| 交给本机 Agent | **⌥ Space** |
| 取消 | Esc |

Demo：下载 PDF 到 `~/Downloads`，右 ⌘ 短按说「帮我整理刚下载的报价发给 Jason」。

内测说明见 [docs/beta-tester-guide.md](docs/beta-tester-guide.md)。官网申请内测码：`pnpm site:dev` 后打开 `/beta`。

## Structure

```
apps/desktop     Electron overlay + React UI（知更客户端）
apps/site        官网（Next.js）：落地页 / 隐私 / 用户协议 / 申请内测码
apps/asr-proxy   Aliyun DashScope ASR relay
apps/account-api 账号与权益 API（可选）
packages/ai      Multi-provider LLM router (Vercel AI SDK)
packages/runtime Orchestrator / Planner / Executor
packages/context Live context engine
packages/skills  finder / pdf / mail skills
packages/memory  SQLite episodes
```

## Requirements

- macOS（当前目标平台）
- Node.js 20+
- pnpm 10+
- Python 3 + `pdfplumber`（PDF 抽取）：`pip install pdfplumber`
- 邮件：Mail.app 自动化权限，或 Desktop 草稿回退

## Docs

- [内测指南](docs/beta-tester-guide.md)
- [体验抽检清单](docs/agent-stress-checklist.md)
- 更多见 [docs/](docs/)
