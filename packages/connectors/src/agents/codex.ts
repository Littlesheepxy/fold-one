import { runShellDetailed } from "../shell.js";
import { getSharedCodexAppServer } from "./codex-app-server.js";
import { buildAgentPrompt } from "./prompt.js";
import type { AgentConnector, AgentResult, AgentTask } from "./types.js";

function lastAgentMessage(stdout: string): string {
	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	let lastError = "";
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]!;
		try {
			const event = JSON.parse(line) as {
				type?: string;
				message?: string;
				item?: { type?: string; text?: string; message?: string };
				error?: { message?: string };
			};
			if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
				return event.item.text.trim();
			}
			if (!lastError) {
				const err =
					event.error?.message ||
					(event.type === "error" ? event.message : undefined) ||
					(event.item?.type === "error" ? event.item.message : undefined);
				if (err?.trim()) lastError = err.trim();
			}
		} catch {
			// not jsonl
		}
	}
	return lastError || stdout.trim();
}

/** 旧路径：codex exec。保留 prevent_idle_sleep；不再用 --ephemeral，方便日后 resume。 */
async function executeViaExec(task: AgentTask): Promise<AgentResult> {
	const args = ["exec"];
	if (task.allowEdits) {
		args.push("--sandbox", "workspace-write");
	}
	// 临时目录 / 非 git 仓库会拒跑；Fold 委派任务由调用方约束 cwd
	args.push("--skip-git-repo-check", "--enable", "prevent_idle_sleep", "--json", buildAgentPrompt(task));

	const result = await runShellDetailed("codex", args, task.timeoutMs ?? 180_000, task.cwd, {
		closeStdin: true,
		signal: task.signal,
	});
	const summary = lastAgentMessage(result.stdout) || result.stderr.trim();

	return {
		ok: result.exitCode === 0 && Boolean(summary) && !isJsonlNoise(summary),
		agentId: "codex",
		summary: isJsonlNoise(summary) ? "Codex 未返回结果" : summary || "Codex 未返回结果",
		exitCode: result.exitCode,
		stderr: result.stderr.trim() || undefined,
		events: [],
		artifacts: [],
		memoryCandidates: [],
	};
}

/** stdout 全是 JSONL 事件、没有 agent_message 时，不当成可读摘要。 */
function isJsonlNoise(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{")) return false;
	return /"type"\s*:\s*"(thread\.|turn\.|item\.)/.test(trimmed);
}

/**
 * 优先：App Server 持久线程（手机 Remote Control 可接管）。
 * 降级：codex exec + prevent_idle_sleep（合盖不保证，仅防空闲睡眠）。
 */
async function executeViaPersistentThread(task: AgentTask): Promise<AgentResult> {
	const client = getSharedCodexAppServer();
	await client.start();
	const resumeSessionId = task.envelope?.resumeSessionId?.trim();
	const threadId = resumeSessionId
		? await client.resumePersistentThread(resumeSessionId)
		: await client.startPersistentThread({
				cwd: task.cwd,
				sandbox: task.allowEdits ? "workspace-write" : "read-only",
				approvalPolicy: "never",
			});
	const turn = await client.runTurn({
		threadId,
		text: buildAgentPrompt(task),
		timeoutMs: task.timeoutMs ?? 180_000,
		signal: task.signal,
	});

	return {
		ok: turn.ok,
		agentId: "codex",
		summary: turn.summary,
		sessionId: threadId,
		exitCode: turn.ok ? 0 : turn.turnStatus === "interrupted" ? 130 : 1,
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
			if (task.signal?.aborted) {
				return {
					ok: false,
					agentId: "codex",
					summary: "Codex 任务已取消",
					exitCode: 130,
					events: [],
					artifacts: [],
					memoryCandidates: [],
				};
			}
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
