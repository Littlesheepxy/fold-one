import type { AgentId, AgentResult, AgentTask } from "./types.js";
import type { LocalTaskArtifact, LocalTaskEvent, MemoryCandidate } from "../task-events.js";

/** Compacted handoff from subagent → Fold main orchestrator (not full chat log). */
export interface SubagentHandoff {
	goal: string;
	currentState: string;
	completedSteps: string[];
	failedSteps: string[];
	evidence: Array<{ type: string; value: string }>;
	remainingSteps: string[];
	blockers: string[];
	safetyNotes: string[];
	agentId: AgentId;
	exitCode: number;
	ok: boolean;
	events: LocalTaskEvent[];
	artifacts: LocalTaskArtifact[];
	memoryCandidates: MemoryCandidate[];
}

export function buildSubagentHandoff(
	task: AgentTask,
	result: AgentResult,
	failedSteps: string[] = [],
): SubagentHandoff {
	const evidence: Array<{ type: string; value: string }> = [
		{ type: "summary", value: result.summary },
	];
	if (result.sessionId) evidence.push({ type: "session_id", value: result.sessionId });
	if (typeof result.costUsd === "number") {
		evidence.push({ type: "cost_usd", value: String(result.costUsd) });
	}
	if (result.stderr) evidence.push({ type: "stderr", value: result.stderr.slice(0, 500) });

	return {
		goal: task.brief,
		currentState: result.ok ? "subagent_completed" : "subagent_failed",
		completedSteps: result.ok ? ["subagent.run"] : [],
		failedSteps: result.ok ? failedSteps : ["subagent.run", ...failedSteps],
		evidence,
		remainingSteps: result.ok ? [] : ["manual_review_or_retry"],
		blockers: result.ok ? [] : [result.stderr ?? result.summary],
		safetyNotes: task.allowEdits
			? ["subagent ran with file edit permission"]
			: ["subagent ran read-only"],
		agentId: result.agentId,
		exitCode: result.exitCode,
		ok: result.ok,
		events: result.events,
		artifacts: result.artifacts,
		memoryCandidates: result.memoryCandidates,
	};
}
