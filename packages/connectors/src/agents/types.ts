export type AgentId = "claude-code" | "codex" | "cursor";

export interface AgentTask {
	brief: string;
	contextSnapshot?: string;
	cwd?: string;
	agent?: AgentId | "auto";
	maxTurns?: number;
	timeoutMs?: number;
	allowEdits?: boolean;
}

import type { SubagentHandoff } from "./handoff.js";

export interface AgentResult {
	ok: boolean;
	agentId: AgentId;
	summary: string;
	sessionId?: string;
	costUsd?: number;
	exitCode: number;
	stderr?: string;
	raw?: unknown;
	/** Compacted payload for Fold orchestrator; not the subagent's full transcript. */
	handoff?: SubagentHandoff;
}

export interface AgentConnector {
	id: AgentId;
	isAvailable(): Promise<boolean>;
	execute(task: AgentTask): Promise<AgentResult>;
}
