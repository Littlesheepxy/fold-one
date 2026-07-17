import assert from "node:assert/strict";
import { createEmptyContext } from "@fold/context";
import { officeCli } from "./office.js";
import type { SkillContext } from "../types.js";

let requested = false;
const ctx: SkillContext = {
	liveContext: createEmptyContext(),
	previousResults: new Map(),
	emit: () => {},
	agentTaskEnvelope: {
		runId: "run-1",
		goal: "给自己发消息",
		currentState: "ready_to_execute",
		context: {},
		relevantMemories: [],
		previousAttempts: [],
		availableCapabilities: ["office.cli"],
		constraints: [],
		acceptanceCriteria: [],
		idempotencyKey: "fold:run-1",
	},
	lookupSideEffectReceipt: () => ({
		status: "confirmed",
		verification: {
			ok: true,
			channel: "feishu",
			operation: "发送消息",
			idempotencyKey: "fold:run-1:cached",
			externalRef: "om_cached",
		},
	}),
	recordSideEffectRequest: () => { requested = true; },
};

const result = await officeCli({
	channel: "feishu",
	args: ["im", "+messages-send", "--as", "user", "--user-id", "ou_self", "--text", "hello"],
}, ctx) as Record<string, unknown>;

assert.equal(result.ok, true);
assert.equal(result.reusedReceipt, true);
assert.equal(result.externalRef, "om_cached");
assert.equal(requested, false);
console.log("office receipt self-check passed");
