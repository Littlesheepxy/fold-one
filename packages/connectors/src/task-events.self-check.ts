import assert from "node:assert/strict";
import {
	createLocalTaskEmitter,
	parseLocalTaskReturn,
	type LocalTaskEvent,
} from "./task-events.js";

const events: LocalTaskEvent[] = [];
const observed: LocalTaskEvent[] = [];
const emit = createLocalTaskEmitter({
	taskId: "task-1",
	source: "codex",
	events,
	onEvent: (event) => observed.push(event),
});

emit("queued", "已排队");
emit("working", "执行中");
emit("succeeded", "已完成");

assert.equal(events.length, 3);
assert.deepEqual(events, observed);
assert.deepEqual(events.map((event) => event.sequence), [0, 1, 2]);
assert.deepEqual(events.map((event) => event.status), ["queued", "working", "succeeded"]);

const parsed = parseLocalTaskReturn(`完成整理。
FOLD_MEMORY_CANDIDATE: {"type":"project","key":"release","value":"周五发布","confidence":0.9,"reason":"后续排期"}
FOLD_ARTIFACT: {"type":"file","value":"/tmp/report.md","label":"报告"}
FOLD_MEMORY_CANDIDATE: {"type":"project","key":"api token","value":"secret-value","confidence":1}
FOLD_MEMORY_CANDIDATE: {"type":"invalid","key":"bad","value":"bad"}
FOLD_ARTIFACT: {"type":"invalid","value":"bad"}`);

assert.equal(parsed.summary, "完成整理。");
assert.equal(parsed.memoryCandidates.length, 1);
assert.equal(parsed.memoryCandidates[0]?.requiresConfirmation, true);
assert.equal(parsed.artifacts.length, 1);

console.log("task-events self-check passed");
