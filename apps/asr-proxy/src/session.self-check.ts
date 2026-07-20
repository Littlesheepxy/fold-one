import assert from "node:assert/strict";
import { resolveSessionModel } from "./session.js";

assert.equal(resolveSessionModel("reply", "fun-asr-realtime", "fun-asr-realtime"), "qwen3.5-omni-plus-realtime");
assert.equal(resolveSessionModel("agent", undefined, "qwen3.5-omni-flash-realtime"), "qwen3.5-omni-plus-realtime");
assert.equal(
	resolveSessionModel("structure", "qwen3.5-omni-plus-realtime", "qwen3.5-omni-plus-realtime"),
	"qwen3.5-omni-flash-realtime",
);
assert.equal(
	resolveSessionModel("structure", undefined, "qwen3.5-omni-plus-realtime"),
	"qwen3.5-omni-flash-realtime",
);
assert.equal(resolveSessionModel("structure", "fun-asr-realtime", "x"), "fun-asr-realtime");

// 有热词：structure 强制 Fun-ASR 引擎 bias
assert.equal(
	resolveSessionModel("structure", undefined, "qwen3.5-omni-flash-realtime", ["InputSurface"]),
	"fun-asr-realtime",
);
assert.equal(
	resolveSessionModel("structure", "qwen3.5-omni-flash-realtime", "qwen3.5-omni-flash-realtime", ["ARR"]),
	"fun-asr-realtime",
);
// reply 有热词仍走 Omni Plus（instructions 注入）
assert.equal(
	resolveSessionModel("reply", undefined, "x", ["ARR"]),
	"qwen3.5-omni-plus-realtime",
);

console.log("asr-proxy session route self-check ok");
