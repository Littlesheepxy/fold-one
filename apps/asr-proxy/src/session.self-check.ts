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

console.log("asr-proxy session route self-check ok");
