import assert from "node:assert/strict";
import { buildSubagentHandoff } from "./handoff.js";
import { buildAgentPrompt } from "./prompt.js";
import type { AgentTask } from "./types.js";

const task: AgentTask = {
	brief: "send the message",
	envelope: {
		runId: "run-1",
		goal: "send the message",
		currentState: "recovering_after_failed_plan",
		context: { taskMoment: { foreground: { app: "Feishu" } } },
		relevantMemories: ["Previous CLI uses --params JSON"],
		previousAttempts: [{ step: "office.cli", error: "unknown option --query" }],
		availableCapabilities: ["office.cli"],
		constraints: ["Do not send twice"],
		acceptanceCriteria: ["Return message_id"],
		idempotencyKey: "fold:run-1",
	},
};
const prompt = buildAgentPrompt(task);

assert.match(prompt, /run-1/);
assert.match(prompt, /Previous CLI uses --params JSON/);
assert.match(prompt, /unknown option --query/);
assert.match(prompt, /Do not send twice/);
assert.match(prompt, /message_id/);

const handoff = buildSubagentHandoff(task, {
	ok: true,
	agentId: "codex",
	summary: "sent; message_id=msg-1",
	sessionId: "thread-1",
	exitCode: 0,
	events: [],
	artifacts: [{ type: "message", value: "msg-1" }],
	memoryCandidates: [],
});
assert.equal(handoff.runId, "run-1");
assert.equal(handoff.sessionId, "thread-1");
assert.equal(handoff.evidence[0]?.type, "summary");

console.log("agent prompt self-check passed");
