import assert from "node:assert/strict";
import { canUseUndoReceipt, createUndoReceipt, UNDO_WINDOW_MS } from "./undo-receipt.js";
import { dedupeFollowUpIntents } from "../src/settings/lib/follow-up.js";

const now = 1_000_000;
const receipt = createUndoReceipt("飞书", now);
assert.equal(receipt.targetApp, "飞书");
assert.equal(canUseUndoReceipt(receipt, now + UNDO_WINDOW_MS), true);
assert.equal(canUseUndoReceipt(receipt, now + UNDO_WINDOW_MS + 1), false);
assert.equal(canUseUndoReceipt(null, now), false);

const followUps = dedupeFollowUpIntents([
	{ id: "new", intent: "帮我整理刚下载的报价发给 Jason" },
	{ id: "old", intent: "帮我整理刚下载的报价发给 Jason。" },
	{ id: "other", intent: "提醒我回复 Sarah" },
]);
assert.deepEqual(followUps.map((item) => item.id), ["new", "other"]);

console.log("golden-flow self-check passed");
