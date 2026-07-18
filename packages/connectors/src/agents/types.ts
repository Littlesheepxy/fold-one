export type AgentId = "claude-code" | "codex" | "cursor";

export interface AgentTaskEnvelope {
	runId: string;
	goal: string;
	currentState: string;
	context: {
		workingContext?: string;
		taskMoment?: unknown;
	};
	relevantMemories: string[];
	previousAttempts: Array<{ step: string; error: string }>;
	availableCapabilities: string[];
	constraints: string[];
	acceptanceCriteria: string[];
	idempotencyKey?: string;
	resumeSessionId?: string;
}

export interface AgentTask {
	taskId?: string;
	brief: string;
	contextSnapshot?: string;
	cwd?: string;
	agent?: AgentId | "auto";
	maxTurns?: number;
	timeoutMs?: number;
	allowEdits?: boolean;
	/** Cancel the local worker without discarding Fold-owned run state. */
	signal?: AbortSignal;
	onEvent?: import("../task-events.js").LocalTaskEventCallback;
	/** Fold-owned task contract. The CLI agent is a worker and must not own product memory. */
	envelope?: AgentTaskEnvelope;
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
	events: import("../task-events.js").LocalTaskEvent[];
	artifacts: import("../task-events.js").LocalTaskArtifact[];
	memoryCandidates: import("../task-events.js").MemoryCandidate[];
	/** Compacted payload for Fold orchestrator; not the subagent's full transcript. */
	handoff?: SubagentHandoff;
}

export interface AgentConnector {
	id: AgentId;
	isAvailable(): Promise<boolean>;
	/** emit：wrapper（agents/index.ts）持有的实时进度发射器，供 connector 在执行期间上报细粒度动作（工具调用等）。 */
	execute(task: AgentTask, emit?: import("../task-events.js").LocalTaskEmit): Promise<AgentResult>;
}
