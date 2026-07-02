import { openInTerminal } from "../terminal.js";

/** Reinstall OpenAI Codex CLI in Terminal (macOS). */
export function openCodexInstallInTerminal(): void {
	openInTerminal("npm i -g @openai/codex && codex --version && codex login");
}

/** Run claude login in Terminal when CLI exists but session may be missing. */
export function openClaudeLoginInTerminal(): void {
	openInTerminal("claude login");
}
