import { runShellDetailed } from "../shell.js";
import type { AgentConnector, AgentResult, AgentTask } from "./types.js";

function parseClaudeJson(stdout: string): { result?: string; session_id?: string; total_cost_usd?: number } {
	const trimmed = stdout.trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start < 0 || end <= start) return {};
	try {
		return JSON.parse(trimmed.slice(start, end + 1)) as {
			result?: string;
			session_id?: string;
			total_cost_usd?: number;
		};
	} catch {
		return {};
	}
}

export const claudeCodeConnector: AgentConnector = {
	id: "claude-code",

	async isAvailable() {
		const result = await runShellDetailed("claude", ["--version"], 5000);
		return result.exitCode === 0;
	},

	async execute(task: AgentTask): Promise<AgentResult> {
		const args = [
			"--bare",
			"-p",
			buildPrompt(task),
			"--output-format",
			"json",
			"--allowedTools",
			task.allowEdits ? "Read,Edit,Bash" : "Read,Bash",
		];
		if (task.maxTurns) args.push("--max-turns", String(task.maxTurns));

		const result = await runShellDetailed("claude", args, task.timeoutMs ?? 180_000, task.cwd);
		const parsed = parseClaudeJson(result.stdout);
		const summary = parsed.result?.trim() || result.stdout.trim() || result.stderr.trim();

		return {
			ok: result.exitCode === 0 && Boolean(summary),
			agentId: "claude-code",
			summary: summary || "Claude Code 未返回结果",
			sessionId: parsed.session_id,
			costUsd: parsed.total_cost_usd,
			exitCode: result.exitCode,
			stderr: result.stderr.trim() || undefined,
			raw: parsed,
		};
	},
};

function buildPrompt(task: AgentTask): string {
	const parts = [task.brief.trim()];
	if (task.contextSnapshot?.trim()) {
		parts.push("", "Fold context:", task.contextSnapshot.trim());
	}
	parts.push("", "Reply with a concise summary of what you did and any artifacts changed.");
	return parts.join("\n");
}
