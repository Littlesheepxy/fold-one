import { runShellDetailed } from "../shell.js";
import type { LocalTaskEmit } from "../task-events.js";
import { buildAgentPrompt } from "./prompt.js";
import type { AgentConnector, AgentResult, AgentTask } from "./types.js";

/**
 * stream-json 每行是独立的 JSON 事件，最终结果取最后一条 type:"result" 行。
 * schema 来自官方文档 cursor.com/docs/cli/reference/output-format；本机 `agent` CLI 未登录，未能真机验证，
 * 但字段名有官方文档 + 两份独立第三方 TS 类型定义互相印证。
 */
export function parseCursorStreamJson(stdout: string): { result?: string; session_id?: string } {
	let final: { result?: string; session_id?: string } | undefined;
	for (const line of stdout.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const event = JSON.parse(trimmed) as { type?: string; result?: string; session_id?: string };
			if (event.type === "result") final = event;
		} catch {
			// stderr 混入或非 JSON 噪音行，忽略
		}
	}
	return final ?? {};
}

const TOOL_CALL_LABELS: Record<string, string> = {
	shellToolCall: "运行命令",
	readToolCall: "读取文件",
	writeToolCall: "写入文件",
	editToolCall: "编辑文件",
	deleteToolCall: "删除文件",
	grepToolCall: "搜索",
	lsToolCall: "列出目录",
	globToolCall: "查找文件",
	todoToolCall: "更新待办",
};

/**
 * 把一行 stream-json 事件转成人话进度提示，取代「Cursor Agent 仍在执行(45s)」式的傻心跳。
 * 只在 tool_call 的 started 阶段上报一次，completed 阶段不重复（避免同一个工具调用刷两条）。
 */
export function describeCursorStreamLine(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith("{")) return null;
	try {
		const event = JSON.parse(trimmed) as {
			type?: string;
			subtype?: string;
			tool_call?: Record<string, { args?: Record<string, unknown> } | undefined>;
		};
		if (event.type !== "tool_call" || event.subtype !== "started") return null;
		const kind = Object.keys(event.tool_call ?? {})[0];
		if (!kind) return null;
		const label = TOOL_CALL_LABELS[kind] ?? kind;
		const args = event.tool_call?.[kind]?.args;
		const detail =
			typeof args?.command === "string"
				? args.command
				: typeof args?.path === "string"
					? args.path
					: typeof args?.pattern === "string"
						? args.pattern
						: undefined;
		return detail ? `${label}: ${detail}` : label;
	} catch {
		return null;
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

	async execute(task: AgentTask, emit?: LocalTaskEmit): Promise<AgentResult> {
		const args = ["-p", "--output-format", "stream-json", buildAgentPrompt(task)];
		if (task.allowEdits) args.splice(1, 0, "--force");
		else args.splice(1, 0, "--mode", "ask");

		const result = await runShellDetailed("agent", args, task.timeoutMs ?? 180_000, task.cwd, {
			closeStdin: true,
			signal: task.signal,
			onStdoutLine: emit
				? (line) => {
						const described = describeCursorStreamLine(line);
						if (described) emit("working", described);
					}
				: undefined,
		});
		const parsed = parseCursorStreamJson(result.stdout);
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
