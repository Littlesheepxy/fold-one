import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendRunEvent,
	getReducedTaskRunState,
	getSideEffectReceipt,
	getTaskRun,
	listRunEvents,
	listTaskCheckpoints,
	listTaskRunsInRange,
	saveTaskCheckpoint,
	startTaskRun,
	updateTaskRun,
	upsertSideEffectReceipt,
} from "./run.js";

const dataDir = mkdtempSync(join(tmpdir(), "fold-run-self-check-"));
const id = randomUUID();

const started = startTaskRun({
	id,
	intent: "检查运行持久化",
	taskMoment: { taskId: id, intent: "检查运行持久化" },
}, dataDir);
assert.equal(started.status, "running");
assert.equal(started.phase, "starting");

saveTaskCheckpoint({
	runId: id,
	phase: "step_started",
	stepId: "step-1",
	skill: "agent.execute",
	status: "running",
}, dataDir);

appendRunEvent({
	runId: id,
	type: "worker.session.bound",
	payload: { sessionId: "thread-1" },
}, dataDir);
appendRunEvent({
	runId: id,
	type: "run.completed",
	payload: { status: "success" },
}, dataDir);

upsertSideEffectReceipt({
	runId: id,
	idempotencyKey: "fold:test:message",
	connector: "feishu",
	operation: "发送消息",
	targetFingerprint: "ou_self",
	inputHash: "abc",
	status: "requested",
}, dataDir);
upsertSideEffectReceipt({
	runId: id,
	idempotencyKey: "fold:test:message",
	connector: "feishu",
	operation: "发送消息",
	targetFingerprint: "ou_self",
	inputHash: "abc",
	status: "confirmed",
	externalRef: "om_1",
	verification: { ok: true },
}, dataDir);
saveTaskCheckpoint({
	runId: id,
	phase: "step_completed",
	stepId: "step-1",
	skill: "agent.execute",
	status: "success",
	payload: { sessionId: "thread-1" },
}, dataDir);

updateTaskRun(id, { phase: "planning" }, dataDir);
updateTaskRun(id, {
	status: "success",
	phase: "completed",
	agentSessionId: "thread-1",
	result: { ok: true },
	completedAt: Date.now(),
}, dataDir);
// updateTaskRun 重复传同一个 phase 不应该再多记一条事件（幂等）。
updateTaskRun(id, { status: "success", phase: "completed" }, dataDir);

const completed = getTaskRun(id, dataDir);
assert.equal(completed?.agentSessionId, "thread-1");
assert.deepEqual(completed?.result, { ok: true });
assert.deepEqual(
	listTaskCheckpoints(id, dataDir).map((checkpoint) => checkpoint.sequence),
	[1, 2],
);
assert.equal(listRunEvents(id, dataDir)[0]?.type, "run.created");
assert.equal(getReducedTaskRunState(id, dataDir)?.status, "success");
assert.equal(getReducedTaskRunState(id, dataDir)?.workerSessionId, "thread-1");
assert.equal(getSideEffectReceipt("fold:test:message", dataDir)?.externalRef, "om_1");

// phase 变化应该落一条 phase.changed 事件（T5 压测靠这个量 planning 停留了多久），且重复同 phase 不重复记。
const phaseEvents = listRunEvents(id, dataDir).filter((e) => e.type === "phase.changed");
assert.deepEqual(
	phaseEvents.map((e) => e.payload),
	[
		{ from: "starting", to: "planning" },
		{ from: "planning", to: "completed" },
	],
);

assert.equal(listTaskRunsInRange(started.createdAt - 1, started.createdAt + 1, dataDir).length, 1);
assert.equal(listTaskRunsInRange(started.createdAt + 10_000, started.createdAt + 20_000, dataDir).length, 0);

console.log("run store self-check passed");
