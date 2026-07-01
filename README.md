# Fold Runtime

Local Context Agent for macOS — understand your computer, execute tasks on demand.

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
```

## Usage

- **⌥ Space** — Toggle voice (press to start, press again to finish and run)
- **Escape** — Cancel recording

Demo flow: download a PDF to `~/Downloads`, press ⌥ Space, say「帮我整理刚下载的报价发给 Jason」, press ⌥ Space again.

## Structure

```
apps/desktop     Electron overlay + React UI
apps/asr-proxy   Aliyun DashScope ASR relay
packages/ai      Multi-provider LLM router (Vercel AI SDK)
packages/runtime Orchestrator / Planner / Executor
packages/context Live context engine
packages/skills  finder / pdf / mail skills
packages/memory  SQLite episodes
```

## Requirements

- macOS (Demo target)
- Node.js 20+
- pnpm 10+
- Python 3 + `pdfplumber` for PDF extraction: `pip install pdfplumber`
- Mail.app automation permission (or fallback draft on Desktop)

## Docs

See [docs/](docs/) for product, UI, architecture, and supa-man reuse notes.
