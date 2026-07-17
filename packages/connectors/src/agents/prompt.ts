import { LOCAL_TASK_RETURN_INSTRUCTIONS } from "../task-events.js";
import type { AgentTask } from "./types.js";

function formatEnvelope(task: AgentTask): string {
	const envelope = task.envelope;
	if (!envelope) return "";
	const blocks = [
		`Run id: ${envelope.runId}`,
		`Goal: ${envelope.goal}`,
		`Current state: ${envelope.currentState}`,
	];
	if (envelope.context.workingContext?.trim()) {
		blocks.push(`Working context:\n${envelope.context.workingContext.trim()}`);
	}
	if (envelope.context.taskMoment) {
		blocks.push(`Task moment (structured):\n${JSON.stringify(envelope.context.taskMoment)}`);
	}
	if (envelope.relevantMemories.length) {
		blocks.push(`Relevant Fold memory:\n${envelope.relevantMemories.join("\n")}`);
	}
	if (envelope.previousAttempts.length) {
		blocks.push(
			`Previous attempts:\n${envelope.previousAttempts
				.map((attempt) => `- ${attempt.step}: ${attempt.error}`)
				.join("\n")}`,
		);
	}
	if (envelope.availableCapabilities.length) {
		blocks.push(`Available capabilities: ${envelope.availableCapabilities.join(", ")}`);
	}
	if (envelope.constraints.length) {
		blocks.push(`Constraints:\n${envelope.constraints.map((item) => `- ${item}`).join("\n")}`);
	}
	if (envelope.acceptanceCriteria.length) {
		blocks.push(
			`Acceptance criteria:\n${envelope.acceptanceCriteria
				.map((item) => `- ${item}`)
				.join("\n")}`,
		);
	}
	if (envelope.idempotencyKey) {
		blocks.push(
			`Idempotency key: ${envelope.idempotencyKey}. Check existing evidence before repeating side effects.`,
		);
	}
	return blocks.join("\n\n");
}

export function buildAgentPrompt(task: AgentTask): string {
	const parts = [task.brief.trim()];
	const envelope = formatEnvelope(task);
	if (envelope) {
		parts.push("", "Fold task envelope:", envelope);
	} else if (task.contextSnapshot?.trim()) {
		parts.push("", "Fold context:", task.contextSnapshot.trim());
	}
	parts.push("", LOCAL_TASK_RETURN_INSTRUCTIONS);
	return parts.join("\n");
}
