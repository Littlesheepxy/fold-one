import assert from "node:assert/strict";
import { createEmptyContext } from "@fold/context";
import { resolveSendChannel } from "./capability-resolver.js";
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
assert.equal(action?.type === "repair" ? action.agent : null, "codex");

// 亲和度序可覆盖默认 feishu→dingtalk；点名仍最高
const bothReady = [
	{ id: "feishu", installed: true, authed: true },
	{ id: "dingtalk", installed: true, authed: true },
];
assert.equal(resolveSendChannel("发给 Jason", bothReady), "feishu");
assert.equal(
	resolveSendChannel("发给 Jason", bothReady, "auto", ["dingtalk", "feishu", "wecom"]),
	"dingtalk",
);
assert.equal(
	resolveSendChannel("在飞书发消息", bothReady, "auto", ["dingtalk", "feishu", "wecom"]),
	"feishu",
);

console.log("recovery self-check passed");
