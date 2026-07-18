import assert from "node:assert/strict";
import type { LiveContext } from "@fold/context";
import { createTaskMoment, formatTaskMoment } from "./task-moment.js";

const now = 1_700_000_000_000;
const ctx: LiveContext = {
	activeApp: "Feishu",
	activeWindow: "Jason",
	activeAppPath: "/Applications/Feishu.app",
	activeUrl: null,
	recentFiles: [],
	recentUrls: [],
	clipboard: { text: "release notes", timestamp: now - 500 },
	recentClipboards: [
		{
			id: "clip-1",
			text: "release notes",
			timestamp: now - 500,
			appName: "Notes",
			windowTitle: "Release",
			appPath: "/Applications/Notes.app",
		},
	],
	events: [
		{
			id: "old",
			type: "app.active",
			source: "system",
			timestamp: now - 60_000,
			data: { appName: "Notes" },
		},
		{
			id: "recent",
			type: "app.active",
			source: "system",
			timestamp: now - 1_000,
			data: { appName: "Feishu", windowTitle: "Jason" },
		},
	],
};

const moment = createTaskMoment("把刚才复制的发给他", ctx, {
	taskId: "task-1",
	now,
	enrichment: {
		accessibilityText: "Jason: 周五可以",
		accessibilityApp: "Feishu",
		accessibilityWindowTitle: "Jason",
		entities: ["Jason"],
	},
});

assert.equal(moment.taskId, "task-1");
assert.deepEqual(moment.evidenceEventIds, ["recent"]);
assert.equal(moment.clipboard.current?.text, "release notes");
assert.equal(moment.clipboard.current?.redacted, false);
assert.equal(moment.accessibility.entities[0], "Jason");
assert.match(formatTaskMoment(moment), /Relevant|Jason|release notes/i);

const sensitive = createTaskMoment(
	"记住这个",
	{
		...ctx,
		clipboard: { text: "api_key=sk-secretvalue123456789", timestamp: now },
		recentClipboards: [],
	},
	{ taskId: "task-2", now },
);
assert.equal(sensitive.clipboard.current?.redacted, true);
assert.equal(sensitive.clipboard.current?.text, "[sensitive clipboard omitted]");

console.log("context assembler self-check passed");
