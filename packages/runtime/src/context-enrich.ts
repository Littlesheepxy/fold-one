import {
	formatCalendarBrief,
	listChromeTabsViaAppleScript,
	listUpcomingCalendarEvents,
	readFrontWindowAccessibilityText,
	readProcessAccessibilityText,
} from "@fold/connectors";
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
		// 日历是「未来」信号：代回/预测/Aha/Agent 都按需拉一次（失败则空）
		listUpcomingCalendarEvents({ withinHours: 12, limit: 5 }).catch(() => []),
	]);

	const chromeTabs =
		scope === "aha" ? filterChromeTabsForAha(ctx, chromeTabsRaw) : chromeTabsRaw;

	const accessibilityText = ax?.text;
	const entities = extractEntityTokens(accessibilityText);
	const enrichment: PredictEnrichment = {
		chromeTabs,
		accessibilityText,
		accessibilityApp: ax?.app,
		accessibilityWindowTitle: ax?.windowTitle,
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
