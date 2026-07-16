import assert from "node:assert/strict";
import { buildOmniInstructions } from "./omni-realtime.js";

const structure = buildOmniInstructions({
	apiKey: "test",
	model: "qwen3.5-omni-plus-realtime",
	mode: "structure",
	app: "飞书",
	windowTitle: "产品群",
});
assert.match(structure, /只保留最后决定/);
assert.match(structure, /场景标签.*飞书/);
assert.doesNotMatch(structure, /产品群/);

const reply = buildOmniInstructions({
	apiKey: "test",
	model: "qwen3.5-omni-plus-realtime",
	mode: "reply",
});
assert.match(reply, /高精度语音转写器/);
assert.doesNotMatch(reply, /语音输入整理器/);

console.log("omni realtime self-check passed");
