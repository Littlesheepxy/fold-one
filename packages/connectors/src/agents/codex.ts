import { runShellDetailed } from "../shell.js";
import type { AgentConnector, AgentResult, AgentTask } from "./types.js";

function lastAgentMessage(stdout: string): string {
	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]!;
		try {
			const event = JSON.parse(line) as {
				type?: string;
				item?: { type?: string; text?: string };
			};
			if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
				return event.item.text.trim();
			}
		} catch {
			// not jsonl
		}
	}
	return stdout.trim();
}

export const codexConnector: AgentConnector = {
	id: "codex",

	async isAvailable() {
		const result = await runShellDetailed("codex", ["--version"], 5000);
		return result.exitCode === 0;
	},

	async execute(task: AgentTask): Promise<AgentResult> {
		const args = [
			"exec",
			"--ephemeral",
			"--json",
			buildPrompt(task),
		];
		if (task.allowEdits) {
			args.splice(2, 0, "--sandbox", "workspace-write");
		}

		const result = await runShellDetailed("codex", args, task.timeoutMs ?? 180_000, task.cwd);
		const summary = lastAgentMessage(result.stdout) || result.stderr.trim();

		return {
			ok: result.exitCode === 0 && Boolean(summary),
			agentId: "codex",
			summary: summary || "Codex 未返回结果",
			exitCode: result.exitCode,
			stderr: result.stderr.trim() || undefined,
		};
	},
};

function buildPrompt(task: AgentTask): string {
	const parts = [task.brief.trim()];
	if (task.contextSnapshot?.trim()) {
		parts.push("", "Fold context:", task.contextSnapshot.trim());
	}
	parts.push("", "Finish with a concise summary of what you did.");
	return parts.join("\n");
}
