import assert from "node:assert/strict";
import {
	decideAhaProactiveShow,
	DEFAULT_AHA_PROACTIVE,
} from "./aha-proactive.js";

const highConfidence = { score: 0.8, level: "high" as const, reasons: [] };
const suggestion = { intent: "回复", label: "替我回复", confidence: 0.85, reason: "r" };

const base = {
	enabled: true,
	confidence: highConfidence,
	suggestions: [suggestion],
	msSinceLastShow: Infinity,
	shownToday: 0,
	maxPerDay: DEFAULT_AHA_PROACTIVE.maxPerDay,
	cooldownMs: DEFAULT_AHA_PROACTIVE.cooldownMs,
	confidenceThreshold: DEFAULT_AHA_PROACTIVE.confidenceThreshold,
	suggestionThreshold: DEFAULT_AHA_PROACTIVE.suggestionThreshold,
};

// 满足全部条件 → 弹
assert.equal(decideAhaProactiveShow(base).show, true);

// 关闭 → 不弹
assert.equal(decideAhaProactiveShow({ ...base, enabled: false }).blockedBy, "disabled");

// 超每日上限 → 不弹
assert.equal(
	decideAhaProactiveShow({ ...base, shownToday: DEFAULT_AHA_PROACTIVE.maxPerDay }).blockedBy,
	"daily-cap",
);

// 冷却中 → 不弹
assert.equal(
	decideAhaProactiveShow({ ...base, msSinceLastShow: 60_000 }).blockedBy,
	"cooldown",
);

// 情境信心不够 → 不弹
assert.equal(
	decideAhaProactiveShow({
		...base,
		confidence: { score: 0.5, level: "medium", reasons: [] },
	}).blockedBy,
	"low-confidence",
);

// 没建议 → 不弹
assert.equal(decideAhaProactiveShow({ ...base, suggestions: [] }).blockedBy, "no-suggestion");

// top 建议信心不够 → 不弹
assert.equal(
	decideAhaProactiveShow({ ...base, suggestions: [{ ...suggestion, confidence: 0.5 }] }).blockedBy,
	"low-suggestion",
);

console.log("aha-proactive self-check passed");
