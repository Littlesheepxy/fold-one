import assert from "node:assert/strict";
import { structureSpeechText } from "./structure-speech.js";

// off：原文直出，不动
const raw = await structureSpeechText("嗯那个我觉得这个产品其实可以先做一个语音输入工具", {
	cleanupLevel: "off",
});
assert.equal(raw.headline, "嗯那个我觉得这个产品其实可以先做一个语音输入工具");

// minimal：只去语气词，不调用云端（allowCloud=false 也不会触发云端）
const minimal = await structureSpeechText("嗯那个我觉得这个产品其实可以先做一个语音输入工具", {
	cleanupLevel: "minimal",
	allowCloud: false,
});
assert.equal(minimal.headline, "我觉得这个产品其实可以先做一个语音输入工具");

// smart：短句走本地（allowCloud=false，结果与 minimal 相同）
const smart = await structureSpeechText("嗯那个我觉得这个产品其实可以先做一个语音输入工具", {
	cleanupLevel: "smart",
	allowCloud: false,
});
assert.equal(smart.headline, "我觉得这个产品其实可以先做一个语音输入工具");

// 默认（不传 cleanupLevel）：行为与 smart 一致
const fallback = await structureSpeechText("嗯那个我觉得这个产品其实可以先做一个语音输入工具", {
	allowCloud: false,
});
assert.equal(fallback.headline, "我觉得这个产品其实可以先做一个语音输入工具");

console.log("structure-speech cleanup-level self-check passed");
