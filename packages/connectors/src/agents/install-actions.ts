import { openInTerminal } from "../terminal.js";

/** Reinstall OpenAI Codex CLI in Terminal (macOS). */
export function openCodexInstallInTerminal(): void {
	openInTerminal("npm i -g @openai/codex && codex --version && codex login");
}

/** Install or log in to Cursor Agent CLI. */
export function openCursorSetupInTerminal(kind: "login" | "install" = "install"): void {
	if (kind === "login") {
		openInTerminal("agent login");
		return;
	}
	openInTerminal(
		"curl https://cursor.com/install -fsSL | bash; agent --version; agent login",
	);
}

/** Run claude login in Terminal when CLI exists but session may be missing. */
export function openClaudeLoginInTerminal(): void {
	openInTerminal("claude login");
}
