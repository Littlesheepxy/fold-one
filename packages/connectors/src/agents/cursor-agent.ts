import { runShellDetailed } from "../shell.js";
import { buildAgentPrompt } from "./prompt.js";
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
		const version = await runShellDetailed("agent", ["--version"], 5000);
		if (version.exitCode !== 0) return false;
		const auth = await runShellDetailed("agent", ["status"], 5000);
		const authText = `${auth.stdout}\n${auth.stderr}`;
		return auth.exitCode === 0 && !/not logged in|authentication required|login required/i.test(authText);
	},

	async execute(task: AgentTask): Promise<AgentResult> {
		const args = ["-p", "--output-format", "json", buildAgentPrompt(task)];
		if (task.allowEdits) args.splice(1, 0, "--force");
		else args.splice(1, 0, "--mode", "ask");

		const result = await runShellDetailed("agent", args, task.timeoutMs ?? 180_000, task.cwd, {
			closeStdin: true,
			signal: task.signal,
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
			events: [],
			artifacts: [],
			memoryCandidates: [],
		};
	},
};
