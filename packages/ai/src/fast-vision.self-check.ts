import assert from "node:assert/strict";
import {
	defaultFastVisionModel,
	resolveModelChoice,
} from "./model-choice.js";

assert.equal(defaultFastVisionModel("zhipu"), "glm-5v-turbo");
assert.equal(defaultFastVisionModel("dashscope"), "qwen3-vl-flash");
assert.equal(defaultFastVisionModel("moonshot"), "moonshot-v1-8k-vision-preview");

process.env.ZHIPU_API_KEY = "test-key";
delete process.env.FOLD_VISION_PROVIDER;
delete process.env.FOLD_VISION_MODEL;
delete process.env.FOLD_FAST_PROVIDER;
const choice = resolveModelChoice("fastVision");
assert.equal(choice.provider, "zhipu");
assert.equal(choice.model, "glm-5v-turbo");

process.env.FOLD_VISION_MODEL = "glm-4.6v-flash";
assert.equal(resolveModelChoice("fastVision").model, "glm-4.6v-flash");

console.log("[fast-vision.self-check] ok");
