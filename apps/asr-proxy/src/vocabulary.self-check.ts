import assert from "node:assert/strict";
import {
	detectHotwordLang,
	isValidHotwordText,
	toVocabularyEntries,
	vocabularyContentHash,
	buildAsrContextText,
	hotwordWeight,
} from "./vocabulary.js";

assert.equal(detectHotwordLang("InputSurface"), "en");
assert.equal(detectHotwordLang("金秋资本"), "zh");
assert.equal(detectHotwordLang("ARR"), "en");
assert.equal(detectHotwordLang("中EN混"), "zh"); // 含汉字按 zh

assert.equal(isValidHotwordText("AB"), true);
assert.equal(isValidHotwordText("a"), false);
assert.equal(isValidHotwordText("这是一个超过十五个汉字长度的超长专有名词测试"), false);
assert.equal(hotwordWeight("ARR"), 5);
assert.equal(hotwordWeight("InputSurface"), 4);

const entries = toVocabularyEntries(
	["InputSurface", "inputsurface", "金秋", "Fast Path", "x", "ARR"],
	10,
);
assert.equal(entries.length, 5); // InputSurface, 金秋, Fast Path, ARR, A R R
assert.ok(entries.some((e) => e.text === "ARR" && e.weight === 5));
assert.ok(entries.some((e) => e.text === "A R R" && e.weight === 5));
assert.ok(entries.some((e) => e.text === "InputSurface" && e.weight === 4));
assert.ok(entries.every((e) => e.weight === 4 || e.weight === 5));

const ctx = buildAsrContextText(["ARR", "InputSurface"]);
assert.match(ctx, /ARR/);
assert.ok(ctx.length <= 400);

const h1 = vocabularyContentHash(entries);
const h2 = vocabularyContentHash(entries);
assert.equal(h1, h2);

console.log("asr-proxy vocabulary self-check ok");
