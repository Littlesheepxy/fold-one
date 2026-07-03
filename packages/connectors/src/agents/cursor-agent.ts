import { runShellDetailed } from "../shell.js";
import type { AgentConnector, AgentResult, AgentTask } from "./types.js";

function parseAgentJson(stdout: string): { result?: string } {
	const trimmed = stdout.trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start < 0 || end <= start) return {};
	try {
		return JSON.parse(trimmed.slice(start, end + 1)) as { result?: string };
	} catch {
		return {};
	}
}

export const cursorAgentConnector: AgentConnector = {
	id: "cursor",

	async isAvailable() {
		const result = await runShellDetailed("agent", ["--version"], 5000);
		return result.exitCode === 0;
	},

	async execute(task: AgentTask): Promise<AgentResult> {
		const args = ["-p", "--output-format", "json", buildPrompt(task)];
		if (task.allowEdits) args.splice(1, 0, "--force");

		const result = await runShellDetailed("agent", args, task.timeoutMs ?? 180_000, task.cwd, {
			closeStdin: true,
		});
		const parsed = parseAgentJson(result.stdout);
		const summary = parsed.result?.trim() || result.stdout.trim() || result.stderr.trim();

		return {
			ok: result.exitCode === 0 && Boolean(parsed.result?.trim()),
			agentId: "cursor",
			summary: summary || "Cursor Agent 未返回结果",
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
	parts.push("", "Reply with a concise summary of what you did.");
	return parts.join("\n");
}
