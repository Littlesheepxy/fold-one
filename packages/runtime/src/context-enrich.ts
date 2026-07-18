import {
	formatCalendarBrief,
	listChromeTabsViaAppleScript,
	listUpcomingCalendarEvents,
	readFrontWindowAccessibilityText,
	readProcessAccessibilityText,
} from "@fold/connectors";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	formatContextBrief,
	formatContextSummary,
	scoreContextConfidence,
	type ContextConfidence,
	type ContextConfidenceLevel,
	type LiveContext,
} from "@fold/context";
import { extractEntityTokens } from "./entity-extract.js";
import { predictContextSnippet } from "./predict-fallback.js";
import type { PredictEnrichment } from "./predict.js";
import { buildProfileBrief } from "./profile-brief.js";
import { loadProfileMemories } from "@fold/memory";

export type ContextEnrichScope = "reply" | "aha" | "predict" | "agent";

export interface EnrichedContext {
	enrichment: PredictEnrichment;
	summary: string;
	brief: string;
	screenSnippet: string;
	confidence: ContextConfidence;
}

function hostFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function filterChromeTabsForAha(
	ctx: LiveContext,
	tabs: Array<{ url: string; title: string; active?: boolean }>,
): Array<{ url: string; title: string; active?: boolean }> {
	const recentHosts = new Set(
		ctx.recentUrls.map((u) => hostFromUrl(u.url)).filter(Boolean),
	);
	if (!recentHosts.size) return [];
	return tabs.filter((tab) => recentHosts.has(hostFromUrl(tab.url)));
}

const SELF_APP_NAMES = new Set(["electron", "fold", "fold-runtime"]);

function isSelfApp(name: string | null | undefined): boolean {
	return SELF_APP_NAMES.has((name ?? "").trim().toLowerCase());
}

export interface EnrichContextOptions {
	/** 语音/代回锁定的目标 App；overlay 在前台时仍能读到正确窗口 */
	targetApp?: string | null;
	/**
	 * 可选：任务时刻截图 + Apple Vision OCR 兜底。
	 * 由 desktop 主进程注入（macos-input addon 只在 Electron 上下文可用）。
	 * - capture: 截屏到本地路径，返回路径
	 * - ocr: 对截图文件跑 Vision OCR，返回文本
	 */
	captureTaskMomentScreenshot?: (taskId: string) => Promise<string | null>;
	ocrImageFile?: (path: string) => Promise<{ text?: string } | null>;
	/** 当前任务 id（截图命名用） */
	taskId?: string;
}

/** L2：按需加深 Context（只读），供代回 / Aha / 预测 / Agent 共用。 */
export async function enrichContext(
	ctx: LiveContext,
	scope: ContextEnrichScope,
	options?: EnrichContextOptions,
): Promise<EnrichedContext> {
	const includeAllChromeTabs = scope === "predict" || scope === "agent";
	const targetApp = options?.targetApp?.trim() || ctx.activeApp?.trim() || null;

	async function readAccessibility() {
		if (targetApp && !isSelfApp(targetApp)) {
			const targeted = await readProcessAccessibilityText(targetApp).catch(() => null);
			if (targeted) return targeted;
		}
		const front = await readFrontWindowAccessibilityText().catch(() => null);
		if (front && !isSelfApp(front.app)) return front;
		if (targetApp && !isSelfApp(targetApp)) {
			return readProcessAccessibilityText(targetApp).catch(() => null);
		}
		return front;
	}

	const [chromeTabsRaw, ax, calendarEvents] = await Promise.all([
		includeAllChromeTabs
			? listChromeTabsViaAppleScript().catch(() => [])
			: Promise.resolve([]),
		readAccessibility(),
		// 日历默认关：需 FOLD_CALENDAR_ENABLED=1（listUpcoming 内部门控）
		listUpcomingCalendarEvents({ withinHours: 12, limit: 5 }).catch(() => []),
	]);

	const chromeTabs =
		scope === "aha" ? filterChromeTabsForAha(ctx, chromeTabsRaw) : chromeTabsRaw;

	// AX 空或过短时，截图 + Apple Vision OCR 兜底；截图同时落盘供任务时刻引用
	let accessibilityText = ax?.text;
	let accessibilitySourceKind: "ax" | "ocr" | undefined = accessibilityText ? "ax" : undefined;
	let screenshotPath: string | null = null;
	const axTooThin = !accessibilityText || accessibilityText.trim().length < 40;
	if (axTooThin && options?.captureTaskMomentScreenshot && options?.ocrImageFile) {
		try {
			screenshotPath = await options.captureTaskMomentScreenshot(options.taskId ?? "moment");
			if (screenshotPath) {
				const ocr = await options.ocrImageFile(screenshotPath);
				const ocrText = ocr?.text?.trim();
				if (ocrText && ocrText.length > (accessibilityText?.trim().length ?? 0)) {
					accessibilityText = ocrText.slice(0, 3000);
					accessibilitySourceKind = "ocr";
				}
			}
		} catch {
			/* OCR 兜底失败不阻断 enrich */
		}
	}

	const entities = extractEntityTokens(accessibilityText);
	const enrichment: PredictEnrichment = {
		chromeTabs,
		accessibilityText,
		accessibilityApp: ax?.app,
		accessibilityWindowTitle: ax?.windowTitle,
		accessibilitySourceKind,
		screenshotPath: screenshotPath ?? undefined,
		entities,
		calendarEvents,
	};

	const briefScope = scope === "agent" ? "agent" : scope === "aha" ? "aha" : "reply";
	const screenSnippet = predictContextSnippet(enrichment);
	const confidence = scoreContextConfidence(ctx, {
		screenSnippetChars: screenSnippet.length,
		visitedChromeTabCount: chromeTabs.length,
	});

	const baseBrief = formatContextBrief(ctx, briefScope);
	const calendarBrief = formatCalendarBrief(calendarEvents);
	const brief = calendarBrief ? `${baseBrief}\n\n${calendarBrief}` : baseBrief;

	return {
		enrichment,
		summary: formatContextSummary(ctx),
		brief,
		screenSnippet,
		confidence,
	};
}

/**
 * Agent Planner / 重规划用的 L2 上下文摘要。
 * 把 AX 屏幕片段、日历、置信度拼进原 contextSummary 槽位（不改 planner 签名）。
 */
export function formatEnrichedPlannerSummary(enriched: EnrichedContext): string {
	const parts: string[] = [enriched.brief];
	const snip = enriched.screenSnippet.trim();
	if (snip) {
		parts.push(`Screen / AX:\n${snip.slice(0, 2000)}`);
	}
	try {
		const profile = buildProfileBrief(loadProfileMemories() ?? {});
		if (profile.trim()) parts.push(profile.trim());
	} catch {
		/* profile optional */
	}
	parts.push(
		`Context confidence: ${enriched.confidence.level} (${Math.round(enriched.confidence.score * 100)}%)`,
	);
	return parts.join("\n\n");
}

export async function buildAgentPlannerContextSummary(
	ctx: LiveContext,
	options?: EnrichContextOptions,
): Promise<{ summary: string; enriched: EnrichedContext }> {
	const enriched = await enrichContext(ctx, "agent", options);
	return { summary: formatEnrichedPlannerSummary(enriched), enriched };
}

/** ponytail: 摘要必含 confidence 行 */
export function runAgentPlannerContextSelfCheck(): void {
	const summary = formatEnrichedPlannerSummary({
		enrichment: {},
		summary: "Active: WeChat",
		brief: "Active app: WeChat\n\n接下来日程：例会",
		screenSnippet: "Jason: 周五能发吗",
		confidence: { level: "medium", score: 0.62, reasons: [] },
	});
	console.assert(summary.includes("WeChat"), "brief in summary");
	console.assert(summary.includes("Jason"), "screen snippet");
	console.assert(summary.includes("Context confidence: medium"), "confidence line");
	console.assert(summary.includes("62%"), "confidence pct");
}

