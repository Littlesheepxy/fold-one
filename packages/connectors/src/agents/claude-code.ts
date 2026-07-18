import { runShellDetailed } from "../shell.js";
import type { LocalTaskEmit } from "../task-events.js";
import { buildAgentPrompt } from "./prompt.js";
import type { AgentConnector, AgentResult, AgentTask } from "./types.js";

/**
 * stream-json 每行是独立的 JSON 事件（不再是一整块 JSON），最终结果取最后一条 type:"result" 行。
 * 字段名（result/session_id/total_cost_usd）与旧 --output-format json 一致，真机跑 stream-json 验证过。
 */
export function parseClaudeStreamJson(stdout: string): {
	result?: string;
	session_id?: string;
	total_cost_usd?: number;
} {
	let final: { result?: string; session_id?: string; total_cost_usd?: number } | undefined;
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const event = JSON.parse(trimmed) as {
				type?: string;
				result?: string;
				session_id?: string;
				total_cost_usd?: number;
			};
			if (event.type === "result") final = event;
		} catch {
			// stderr 混入或非 JSON 噪音行，忽略
		}
	}
	return final ?? {};
}

/**
 * 把一行 stream-json 事件转成人话进度提示，取代「Claude Code 仍在执行(45s)」式的傻心跳。
 * tool_use content block 是 Anthropic Messages API 的标准形状（文档稳定），本机未能用真实工具调用验证——
 * 账号计费问题（volcengine ARK CodingPlan 过期）在任何工具调用前就报错，只验证了 system/assistant(text)/result。
 */
export function describeClaudeStreamLine(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("{")) return null;
	try {
		const event = JSON.parse(trimmed) as {
			type?: string;
			message?: { content?: Array<{ type?: string; name?: string }> };
		};
		if (event.type !== "assistant") return null;
		const names = (event.message?.content ?? [])
			.filter((block) => block.type === "tool_use" && block.name)
			.map((block) => block.name as string);
		return names.length ? `使用工具: ${names.join(", ")}` : null;
	} catch {
		return null;
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

	async execute(task: AgentTask, emit?: LocalTaskEmit): Promise<AgentResult> {
		const args = [
			"--bare",
			"-p",
			buildAgentPrompt(task),
			"--output-format",
			"stream-json",
			"--verbose",
			"--allowedTools",
			task.allowEdits ? "Read,Edit,Bash" : "Read,Bash",
		];
		const resumeSessionId = task.envelope?.resumeSessionId?.trim();
		if (resumeSessionId) args.push("--resume", resumeSessionId);
		if (task.maxTurns) args.push("--max-turns", String(task.maxTurns));

		const result = await runShellDetailed("claude", args, task.timeoutMs ?? 180_000, task.cwd, {
			closeStdin: true,
			signal: task.signal,
			onStdoutLine: emit
				? (line) => {
						const described = describeClaudeStreamLine(line);
						if (described) emit("working", described);
					}
				: undefined,
		});
		const parsed = parseClaudeStreamJson(result.stdout);
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
