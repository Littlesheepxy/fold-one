import {
	listChromeTabsViaAppleScript,
	readFrontWindowAccessibilityText,
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

/** L2：按需加深 Context（只读），供代回 / Aha / 预测 / Agent 共用。 */
export async function enrichContext(
	ctx: LiveContext,
	scope: ContextEnrichScope,
): Promise<EnrichedContext> {
	const includeAllChromeTabs = scope === "predict" || scope === "agent";

	const [chromeTabsRaw, ax] = await Promise.all([
		includeAllChromeTabs
			? listChromeTabsViaAppleScript().catch(() => [])
			: Promise.resolve([]),
		readFrontWindowAccessibilityText().catch(() => null),
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
	};

	const briefScope = scope === "agent" ? "agent" : scope === "aha" ? "aha" : "reply";
	const screenSnippet = predictContextSnippet(enrichment);
	const confidence = scoreContextConfidence(ctx, {
		screenSnippetChars: screenSnippet.length,
		visitedChromeTabCount: chromeTabs.length,
	});

	return {
		enrichment,
		summary: formatContextSummary(ctx),
		brief: formatContextBrief(ctx, briefScope),
		screenSnippet,
		confidence,
	};
}
