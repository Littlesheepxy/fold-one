import { runShellDetailed } from "../shell.js";
import { buildAgentPrompt } from "./prompt.js";
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

function isCliNoise(text: string): boolean {
	return /no stdin data received|proceeding without it/i.test(text);
}

export const claudeCodeConnector: AgentConnector = {
	id: "claude-code",

	async isAvailable() {
		const version = await runShellDetailed("claude", ["--version"], 5000);
		if (version.exitCode !== 0) return false;
		const auth = await runShellDetailed("claude", ["auth", "status"], 5000);
		return auth.exitCode === 0;
	},

	async execute(task: AgentTask): Promise<AgentResult> {
		const args = [
			"--bare",
			"-p",
			buildAgentPrompt(task),
			"--output-format",
			"json",
			"--allowedTools",
			task.allowEdits ? "Read,Edit,Bash" : "Read,Bash",
		];
		const resumeSessionId = task.envelope?.resumeSessionId?.trim();
		if (resumeSessionId) args.push("--resume", resumeSessionId);
		if (task.maxTurns) args.push("--max-turns", String(task.maxTurns));

		const result = await runShellDetailed("claude", args, task.timeoutMs ?? 180_000, task.cwd, {
			closeStdin: true,
			signal: task.signal,
		});
		const parsed = parseClaudeJson(result.stdout);
		const summary =
			parsed.result?.trim() ||
			(!isCliNoise(result.stdout) ? result.stdout.trim() : "") ||
			(!isCliNoise(result.stderr) ? result.stderr.trim() : "");

		return {
			ok: result.exitCode === 0 && Boolean(parsed.result?.trim()),
			agentId: "claude-code",
			summary: summary || "Claude Code 未返回有效结果",
			sessionId: parsed.session_id,
			costUsd: parsed.total_cost_usd,
			exitCode: result.exitCode,
			stderr: result.stderr.trim() || undefined,
			raw: parsed,
			events: [],
			artifacts: [],
			memoryCandidates: [],
		};
	},
};
