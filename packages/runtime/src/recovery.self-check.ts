import assert from "node:assert/strict";
import { createEmptyContext } from "@fold/context";
import { classifyFailure, handleFailure, selectRepairBackend } from "./recovery.js";
import type { RecoveryContext } from "./recovery.js";

const contractFailure = {
	stepId: "office",
	skill: "office.cli",
	status: "failed" as const,
	durationMs: 1,
	error: "unknown option --query\nUsage: lark im +messages-send",
	retryable: true,
};

assert.equal(classifyFailure(contractFailure), "tool.contract");

const context: RecoveryContext = {
	intent: "通过飞书给自己发消息",
	liveContext: createEmptyContext(),
	failures: [contractFailure],
	validationFailed: true,
	agentsEnabled: true,
	availableAgents: ["codex"],
	cdpConnected: false,
	uitarsEnabled: false,
	uitarsAvailable: false,
	workbuddyAvailable: false,
	screenCaptureAvailable: false,
	screenshotSucceeded: false,
	repairAttempts: 0,
	maxRepairAttempts: 1,
};

assert.equal(selectRepairBackend(context, 0), "agent");
const action = handleFailure(context);
assert.equal(action?.type, "repair");
assert.equal(action?.type === "repair" ? action.backend : null, "agent");

console.log("recovery self-check passed");
