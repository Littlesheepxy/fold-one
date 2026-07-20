/**
 * workbuddy fit self-check
 * 用法：pnpm exec tsx packages/connectors/src/workbuddy/fit.self-check.ts
 */
import assert from "node:assert/strict";
import { workbuddyToolsFitIntent } from "./fit.js";

const ardotTools = [
	"ardot_create_design",
	"ardot_open_design",
	"conversation_search",
	"show_widget",
];

assert.equal(
	workbuddyToolsFitIntent("把这篇会议纪要同步进我的 Obsidian vault", ardotTools),
	false,
	"obsidian should not fit ardot-only tools",
);
assert.equal(
	workbuddyToolsFitIntent("帮我在 Ardot 里新建一个设计稿", ardotTools),
	true,
	"ardot intent should fit",
);
assert.equal(
	workbuddyToolsFitIntent("用 WorkBuddy 随便跑一下", ardotTools),
	true,
	"explicit workbuddy always fits",
);
assert.equal(
	workbuddyToolsFitIntent("同步进 Obsidian vault", ["wb_run", "wb_search"]),
	true,
	"open runner fits any workflow",
);
assert.equal(
	workbuddyToolsFitIntent("整理一下工作流", ["conversation_search", "show_widget"]),
	false,
	"chat-only tools should not fit generic workflow",
);
assert.equal(
	workbuddyToolsFitIntent("同步进 Obsidian vault", []),
	true,
	"unknown tools: keep old allow behavior",
);

console.log("workbuddy fit self-check passed");
