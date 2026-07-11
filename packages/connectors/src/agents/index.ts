import { claudeCodeConnector } from "./claude-code.js";
import { codexConnector } from "./codex.js";
import { cursorAgentConnector } from "./cursor-agent.js";
import { buildSubagentHandoff } from "./handoff.js";
import { runShellDetailed } from "../shell.js";
import type { AgentConnector, AgentId, AgentResult, AgentTask } from "./types.js";

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
			const result = await runShellDetailed(AGENT_CLI[connector.id], ["--version"], 5000);
			return {
				id: connector.id,
				label: AGENT_LABELS[connector.id],
				available: result.exitCode === 0,
				error: result.exitCode === 0 ? undefined : formatAgentProbeError(result.stderr, result.stdout),
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

	for (const connector of CONNECTORS) {
		if (await connector.isAvailable()) return connector;
	}
	throw new Error("未找到可用的本地 Agent CLI（claude / codex / agent）");
}

export async function executeAgent(task: AgentTask, failedSteps: string[] = []): Promise<AgentResult> {
	assertAgentSubagentsEnabled();
	const connector = await resolveConnector(task.agent);
	const result = await connector.execute(task);
	return {
		...result,
		handoff: buildSubagentHandoff(task, result, failedSteps),
	};
}

export type { SubagentHandoff } from "./handoff.js";

export { openCodexInstallInTerminal, openClaudeLoginInTerminal, openCursorSetupInTerminal } from "./install-actions.js";

export type { AgentConnector, AgentId, AgentResult, AgentTask } from "./types.js";
