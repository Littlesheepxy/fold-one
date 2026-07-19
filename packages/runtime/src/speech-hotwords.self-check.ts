import assert from "node:assert/strict";
import { resolveSpeechHotwords } from "./speech-hotwords.js";

// profile 专名优先，输入法词库补充，合并去重、截 limit。
const hotwords = resolveSpeechHotwords({
	profile: {
		role: "投资经理",
		domains: ["AI 早期投资"],
		preferredTools: ["飞书", "Figma"],
		summary: "关注 ARR 与续费率",
	},
	lexicon: [
		{ surface: "ARR", kind: "hot_word", source: "sogou" },
		{ surface: "知更", kind: "word", source: "apple" },
		{ surface: "金秋", kind: "text_replacement", source: "apple" },
		{ surface: "x", kind: "word", source: "apple" }, // 单字母噪声，过滤
		{ surface: "！！！", kind: "word", source: "apple" }, // 纯标点，过滤
		{ surface: "飞书", kind: "word", source: "apple" }, // 与 profile 重复，去重
	],
});
assert.deepEqual(hotwords.slice(0, 3), ["投资经理", "AI 早期投资", "飞书"]);
assert.ok(hotwords.includes("金秋"), "输入法 text_replacement 应进入热词");
assert.ok(!hotwords.includes("x"), "单字母应被过滤");
assert.ok(!hotwords.includes("！！！"), "纯标点应被过滤");
assert.equal(hotwords.filter((w) => w === "飞书").length, 1, "重复词只保留一个");
assert.ok(hotwords.length <= 12);

// hot_word 优先级高于普通 word（同为输入法来源时）。
const ranked = resolveSpeechHotwords({
	profile: null,
	lexicon: [
		{ surface: "普通词", kind: "word", source: "apple" },
		{ surface: "热词优先", kind: "hot_word", source: "sogou" },
	],
});
assert.deepEqual(ranked, ["热词优先", "普通词"]);

// limit 生效；空输入安全。
assert.equal(resolveSpeechHotwords({ profile: null, lexicon: [], limit: 2 }).length, 0);
assert.equal(
	resolveSpeechHotwords({
		profile: null,
		lexicon: [
			{ surface: "甲乙", kind: "word" },
			{ surface: "丙丁", kind: "word" },
			{ surface: "戊己", kind: "word" },
		],
		limit: 2,
	}).length,
	2,
);
assert.deepEqual(resolveSpeechHotwords({ profile: null }), []);

console.log("speech-hotwords self-check passed");
