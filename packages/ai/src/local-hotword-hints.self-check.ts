import assert from "node:assert/strict";
import {
	applyContextualAcronymFixes,
	applyLocalHotwordHints,
	structureSpeechText,
} from "./structure-speech.js";

const keywords = ["InputSurface", "ThoughtSurface", "Fast Path", "ARR"];

assert.equal(
	applyLocalHotwordHints("input surface 和 thought surface 是两个独立的 surface", keywords),
	"InputSurface 和 ThoughtSurface 是两个独立的 surface",
);
assert.equal(
	applyLocalHotwordHints("fast path 要优先保证 first character latency", keywords),
	"Fast Path 要优先保证 first character latency",
);
assert.equal(
	applyLocalHotwordHints("FAST PATH 要优先保证 latency", keywords),
	"Fast Path 要优先保证 latency",
);

assert.equal(
	applyLocalHotwordHints("inputsurface和thoughtsurface是两个独立的surface", keywords),
	"InputSurface和ThoughtSurface是两个独立的surface",
);
assert.equal(
	applyLocalHotwordHints("fastpath要优先保证firstcharacterlatency", keywords),
	"Fast Path要优先保证firstcharacterlatency",
);

assert.equal(
	applyLocalHotwordHints("InputSurface 和 ThoughtSurface 应该独立", keywords),
	"InputSurface 和 ThoughtSurface 应该独立",
);

assert.equal(
	applyLocalHotwordHints("这家公司今年 on 大概三千万", keywords),
	"这家公司今年 on 大概三千万",
);
assert.equal(
	applyLocalHotwordHints("SURE FACE 和 FOUGHT SURFACE", keywords),
	"SURE FACE 和 FOUGHT SURFACE",
);

assert.equal(
	applyContextualAcronymFixes("这家公司今年on大概三千万，续费率还可以", keywords),
	"这家公司今年ARR大概三千万，续费率还可以",
);
assert.equal(applyContextualAcronymFixes("请把灯 on 一下", keywords), "请把灯 on 一下");
assert.equal(
	applyContextualAcronymFixes("这个reserver不应该重置", ["resolver"]),
	"这个resolver不应该重置",
);

assert.equal(applyLocalHotwordHints("input surface", undefined), "input surface");
assert.equal(applyLocalHotwordHints("input surface", []), "input surface");

const freeLocal = await structureSpeechText(
	"input surface 和 thought surface 应该是两个独立的 surface",
	{ allowCloud: false, profileKeywords: keywords },
);
assert.match(freeLocal.headline, /InputSurface/);
assert.match(freeLocal.headline, /ThoughtSurface/);

const paidShort = await structureSpeechText(
	"fast path 要优先保证 first character latency",
	{
		allowCloud: true,
		preferQuality: true,
		profileKeywords: keywords,
	},
);
assert.match(paidShort.headline, /Fast Path/i);

const paidLocal = await structureSpeechText("这家公司今年on大概三千万，续费率还可以", {
	allowCloud: false,
	preferQuality: true,
	profileKeywords: keywords,
});
assert.match(paidLocal.headline, /ARR/);

console.log("local-hotword-hints self-check passed");
