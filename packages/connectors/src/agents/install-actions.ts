import { spawn } from "node:child_process";

function openTerminalCommand(cmd: string): void {
	if (process.platform === "darwin") {
		const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		spawn(
			"osascript",
			["-e", `tell application "Terminal" to do script "${escaped}"`],
			{ detached: true, stdio: "ignore" },
		).unref();
		return;
	}
	spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
}

/** Reinstall OpenAI Codex CLI in Terminal (macOS). */
export function openCodexInstallInTerminal(): void {
	openTerminalCommand("npm i -g @openai/codex && codex --version && codex login");
}

/** Run claude login in Terminal when CLI exists but session may be missing. */
export function openClaudeLoginInTerminal(): void {
	openTerminalCommand("claude login");
}
