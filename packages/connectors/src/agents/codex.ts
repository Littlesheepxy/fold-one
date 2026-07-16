import { runShellDetailed } from "../shell.js";
import { LOCAL_TASK_RETURN_INSTRUCTIONS } from "../task-events.js";
import { getSharedCodexAppServer } from "./codex-app-server.js";
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

function buildPrompt(task: AgentTask): string {
	const parts = [task.brief.trim()];
	if (task.contextSnapshot?.trim()) {
		parts.push("", "Fold context:", task.contextSnapshot.trim());
	}
	parts.push("", LOCAL_TASK_RETURN_INSTRUCTIONS);
	return parts.join("\n");
}

/** 旧路径：codex exec。保留 prevent_idle_sleep；不再用 --ephemeral，方便日后 resume。 */
async function executeViaExec(task: AgentTask): Promise<AgentResult> {
	const args = ["exec", "--enable", "prevent_idle_sleep", "--json", buildPrompt(task)];
	if (task.allowEdits) {
		args.splice(2, 0, "--sandbox", "workspace-write");
	}

	const result = await runShellDetailed("codex", args, task.timeoutMs ?? 180_000, task.cwd, {
		closeStdin: true,
	});
	const summary = lastAgentMessage(result.stdout) || result.stderr.trim();

	return {
		ok: result.exitCode === 0 && Boolean(summary),
		agentId: "codex",
		summary: summary || "Codex 未返回结果",
		exitCode: result.exitCode,
		stderr: result.stderr.trim() || undefined,
		events: [],
		artifacts: [],
		memoryCandidates: [],
	};
}

/**
 * 优先：App Server 持久线程（手机 Remote Control 可接管）。
 * 降级：codex exec + prevent_idle_sleep（合盖不保证，仅防空闲睡眠）。
 */
async function executeViaPersistentThread(task: AgentTask): Promise<AgentResult> {
	const client = getSharedCodexAppServer();
	await client.start();
	const threadId = await client.startPersistentThread({
		cwd: task.cwd,
		sandbox: task.allowEdits ? "workspaceWrite" : "readOnly",
		approvalPolicy: "never",
	});
	const turn = await client.runTurn({
		threadId,
		text: buildPrompt(task),
		timeoutMs: task.timeoutMs ?? 180_000,
	});

	return {
		ok: turn.ok,
		agentId: "codex",
		summary: turn.summary,
		sessionId: threadId,
		exitCode: turn.ok ? 0 : 1,
		events: [],
		artifacts: [],
		memoryCandidates: [],
	};
}

export const codexConnector: AgentConnector = {
	id: "codex",

	async isAvailable() {
		const version = await runShellDetailed("codex", ["--version"], 5000);
		if (version.exitCode !== 0) return false;
		const auth = await runShellDetailed("codex", ["login", "status"], 5000);
		return auth.exitCode === 0;
	},

	async execute(task: AgentTask): Promise<AgentResult> {
		try {
			return await executeViaPersistentThread(task);
		} catch (error) {
			// App Server / Remote Control API 不可用（旧版 CLI、二进制损坏）时回退
			const fallback = await executeViaExec(task);
			if (!fallback.ok && error instanceof Error) {
				fallback.stderr = [fallback.stderr, `app-server: ${error.message}`]
					.filter(Boolean)
					.join("\n");
			}
			return fallback;
		}
	},
};
