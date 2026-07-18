/**
 * task-moment-ocr self-check — screenshotPath / sourceKind 落进 moment，AX 空时 OCR 兜底。
 * 用法：pnpm exec tsx packages/runtime/src/task-moment-ocr.self-check.ts
 */
import assert from "node:assert/strict";
import type { LiveContext } from "@fold/context";
import { createTaskMoment } from "./task-moment.js";
import { enrichContext } from "./context-enrich.js";

const now = 1_700_000_000_000;
const ctx: LiveContext = {
	activeApp: "WeChat",
	activeWindow: "微信",
	activeAppPath: "/Applications/WeChat.app",
	activeUrl: null,
	recentFiles: [],
	recentUrls: [],
	recentClipboards: [],
	clipboard: null,
	events: [],
	focusDwells: [],
} as unknown as LiveContext;

// createTaskMoment 落 sourceKind 与 screenshotPath
{
	const m = createTaskMoment("看看微信在聊什么", ctx, {
		taskId: "t-ocr",
		now,
		enrichment: {
			accessibilityText: "ShowMeAI 踏浪而歌（416）",
			accessibilityApp: "WeChat",
			accessibilitySourceKind: "ocr",
			screenshotPath: "/Users/x/.fold/moments/t-ocr.png",
			entities: ["ShowMeAI"],
		},
	});
	assert.equal(m.accessibility.sourceKind, "ocr");
	assert.equal(m.screenshot?.path, "/Users/x/.fold/moments/t-ocr.png");
}

// 无 OCR 兜底时 sourceKind 为 undefined、screenshot 为空
{
	const m = createTaskMoment("x", ctx, { taskId: "t-ax", now, enrichment: { accessibilityText: "abc" } });
	assert.equal(m.accessibility.sourceKind, undefined);
	assert.equal(m.screenshot, undefined);
}

// enrichContext：AX 空 + 注入 capture/ocr 时走 ocr 兜底并标记 sourceKind
{
	const enriched = await enrichContext(ctx, "agent", {
		captureTaskMomentScreenshot: async () => "/tmp/fake-moment.png",
		ocrImageFile: async () => ({ text: "识别出的微信会话列表群名群名群名" }),
	});
	// AX 在 Node 下返回 null，触发兜底
	assert.equal(enriched.enrichment.accessibilitySourceKind, "ocr");
	assert.equal(enriched.enrichment.screenshotPath, "/tmp/fake-moment.png");
	assert.match(enriched.enrichment.accessibilityText ?? "", /群名/);
}

// enrichContext：OCR 返回空时不覆盖、不标 ocr
{
	const enriched = await enrichContext(ctx, "agent", {
		captureTaskMomentScreenshot: async () => "/tmp/fake2.png",
		ocrImageFile: async () => ({ text: "" }),
	});
	assert.notEqual(enriched.enrichment.accessibilitySourceKind, "ocr");
}

// enrichContext：capture 抛错不阻断 enrich
{
	const enriched = await enrichContext(ctx, "agent", {
		captureTaskMomentScreenshot: async () => {
			throw new Error("no permission");
		},
		ocrImageFile: async () => ({ text: "x".repeat(100) }),
	});
	assert.ok(enriched);
	assert.notEqual(enriched.enrichment.accessibilitySourceKind, "ocr");
}

console.log("task-moment-ocr self-check passed");
