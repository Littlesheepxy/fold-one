import { randomUUID } from "node:crypto";
import { claudeCodeConnector } from "./claude-code.js";
import { codexConnector } from "./codex.js";
import { cursorAgentConnector } from "./cursor-agent.js";
import { buildSubagentHandoff } from "./handoff.js";
import { runShellDetailed } from "../shell.js";
import type { AgentConnector, AgentId, AgentResult, AgentTask } from "./types.js";
import {
	createLocalTaskEmitter,
	parseLocalTaskReturn,
	type LocalTaskEvent,
} from "../task-events.js";

const CONNECTORS: AgentConnector[] = [claudeCodeConnector, codexConnector, cursorAgentConnector];

const AGENT_LABELS: Record<AgentId, string> = {
	"claude-code": "Claude Code",
	codex: "Codex",
	cursor: "Cursor Agent",
};

const AGENT_CLI: Record<AgentId, string> = {
	"claude-code": "claude",
	codex: "codex",
	cursor: "agent",
};

export interface AgentProbeStatus {
	id: AgentId;
	label: string;
	available: boolean;
	error?: string;
}

function formatAgentProbeError(stderr: string, stdout: string): string {
	const msg = (stderr || stdout || "").trim();
	if (!msg) return "未检测到 CLI";
	if (/ENOENT/i.test(msg)) return "CLI 未安装完整，需重装";
	if (msg.length > 96) return `${msg.slice(0, 96)}…`;
	return msg;
}

export async function probeAllAgents(): Promise<AgentProbeStatus[]> {
	return Promise.all(
		CONNECTORS.map(async (connector) => {
			const version = await runShellDetailed(AGENT_CLI[connector.id], ["--version"], 5000);
			if (version.exitCode !== 0) {
				return {
					id: connector.id,
					label: AGENT_LABELS[connector.id],
					available: false,
					error: formatAgentProbeError(version.stderr, version.stdout),
				};
			}
			const authArgs =
				connector.id === "claude-code"
					? ["auth", "status"]
					: connector.id === "codex"
						? ["login", "status"]
						: ["status"];
			const auth = await runShellDetailed(AGENT_CLI[connector.id], authArgs, 5000);
			const authText = `${auth.stdout}\n${auth.stderr}`;
			const explicitlyLoggedOut =
				connector.id === "cursor" &&
				/not logged in|authentication required|login required/i.test(authText);
			const available = auth.exitCode === 0 && !explicitlyLoggedOut;
			return {
				id: connector.id,
				label: AGENT_LABELS[connector.id],
				available,
				error: available ? undefined : "CLI 已安装但未登录",
			};
		}),
	);
}

export function isAgentSubagentsEnabled(): boolean {
	return process.env.FOLD_ALLOW_AGENT_SUBAGENTS === "1";
}

export function assertAgentSubagentsEnabled(): void {
	if (!isAgentSubagentsEnabled()) {
		throw new Error("本地 Agent Subagent 未启用。请设置 FOLD_ALLOW_AGENT_SUBAGENTS=1");
	}
}

export async function listAvailableAgents(): Promise<AgentId[]> {
	const available = await Promise.all(
		CONNECTORS.map(async (connector) => ((await connector.isAvailable()) ? connector.id : null)),
	);
	return available.filter((id): id is AgentId => id !== null);
}

async function resolveConnector(agent?: AgentId | "auto"): Promise<AgentConnector> {
	if (agent && agent !== "auto") {
		const connector = CONNECTORS.find((c) => c.id === agent);
		if (!connector) throw new Error(`Unknown agent: ${agent}`);
		if (!(await connector.isAvailable())) throw new Error(`Agent CLI 不可用: ${agent}`);
		return connector;
	}

	const preferred = process.env.FOLD_PREFERRED_EXECUTOR?.trim();
	if (preferred === "claude-code" || preferred === "codex" || preferred === "cursor") {
		const hit = CONNECTORS.find((c) => c.id === preferred);
		if (hit && (await hit.isAvailable())) return hit;
	}

	for (const connector of CONNECTORS) {
		if (await connector.isAvailable()) return connector;
	}
	throw new Error("未找到可用的本地 Agent CLI（claude / codex / agent）");
}

export async function executeAgent(task: AgentTask, failedSteps: string[] = []): Promise<AgentResult> {
	assertAgentSubagentsEnabled();
	const taskId = task.taskId ?? randomUUID();
	const events: LocalTaskEvent[] = [];
	const connector = await resolveConnector(task.agent);
	const emit = createLocalTaskEmitter({
		taskId,
		source: connector.id,
		onEvent: task.onEvent,
		events,
	});
	emit("queued", "任务已交给本地 Agent");
	emit("starting", `${AGENT_LABELS[connector.id]} 正在启动`);
	const startedAt = Date.now();
	const heartbeat = setInterval(() => {
		const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
		emit("working", `${AGENT_LABELS[connector.id]} 仍在执行`, { elapsedSeconds: seconds });
	}, 15_000);
	heartbeat.unref?.();
	let result: AgentResult;
	try {
		result = await connector.execute({ ...task, taskId, onEvent: undefined });
	} catch (error) {
		emit("failed", (error as Error).message || `${AGENT_LABELS[connector.id]} 执行失败`);
		throw error;
	} finally {
		clearInterval(heartbeat);
	}
	const returned = parseLocalTaskReturn(result.summary);
	result = {
		...result,
		summary: returned.summary || result.summary,
		events,
		artifacts: returned.artifacts,
		memoryCandidates: returned.memoryCandidates,
	};
	emit(
		result.ok ? "succeeded" : "failed",
		result.ok ? `${AGENT_LABELS[connector.id]} 已完成任务` : `${AGENT_LABELS[connector.id]} 执行失败`,
		{ exitCode: result.exitCode },
	);
	return {
		...result,
		events,
		handoff: buildSubagentHandoff(task, result, failedSteps),
	};
}

export type { AgentResultEnvelope, SubagentHandoff } from "./handoff.js";

export { openCodexInstallInTerminal, openClaudeLoginInTerminal, openCursorSetupInTerminal } from "./install-actions.js";

export type {
	AgentConnector,
	AgentId,
	AgentResult,
	AgentTask,
	AgentTaskEnvelope,
} from "./types.js";
