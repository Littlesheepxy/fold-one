import {
	captureScreenshot,
	listChromeTabsViaAppleScript,
	readFrontWindowAccessibilityText,
} from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import {
	buildPredictions,
	extractEntityTokens,
	getPredictions,
	needsScreenCalibration,
	refreshPredictCache,
	retrieveSimilarTraces,
	type PredictEnrichment,
	type PredictResult,
} from "@fold/runtime";

function attachTraceReasons(
	result: PredictResult,
	ctx: LiveContext,
	enrichment: PredictEnrichment,
	dataDir?: string,
): PredictResult {
	const traces = retrieveSimilarTraces(ctx, dataDir, 2, enrichment);
	if (!traces.length) return result;
	const suggestions = result.suggestions.map((s) => {
		const trace = traces.find((t) => t.intent.trim() === s.intent);
		if (!trace) return s;
		if (trace.thinkingSnippet) {
			return { ...s, reason: `${s.reason} · ${trace.thinkingSnippet}` };
		}
		if (trace.planSteps.length) {
			return {
				...s,
				reason: `${s.reason} · 曾用 ${trace.planSteps.slice(0, 3).join(" → ")}`,
			};
		}
		return s;
	});
	return { ...result, suggestions };
}

export async function gatherPredictEnrichment(): Promise<PredictEnrichment> {
	const [chromeTabs, ax] = await Promise.all([
		listChromeTabsViaAppleScript().catch(() => []),
		readFrontWindowAccessibilityText().catch(() => null),
	]);
	const accessibilityText = ax?.text;
	const entities = extractEntityTokens(accessibilityText);
	return { chromeTabs, accessibilityText, entities };
}

async function screenTextViaOcr(): Promise<string | undefined> {
	if (!process.env.ZHIPU_API_KEY?.trim()) return undefined;
	try {
		const shot = await captureScreenshot({ target: "frontmost" });
		const { extractPdfWithZhipuOcr } = await import("@fold/skills/src/builtin/zhipu-ocr.js");
		const ocr = await extractPdfWithZhipuOcr(shot.path);
		const text = ocr.rawText?.trim();
		return text ? text.slice(0, 2500) : undefined;
	} catch {
		return undefined;
	}
}

export async function resolvePredictions(ctx: LiveContext, dataDir?: string): Promise<PredictResult> {
	const enrichment = await gatherPredictEnrichment();
	let result = getPredictions(ctx, dataDir, enrichment);
	result = attachTraceReasons(result, ctx, enrichment, dataDir);

	if (!needsScreenCalibration(result, enrichment)) return result;

	const screenText = await screenTextViaOcr();
	if (!screenText) return result;

	const rich = {
		...enrichment,
		screenText,
		entities: [...new Set([...(enrichment.entities ?? []), ...extractEntityTokens(screenText)])],
	};
	result = buildPredictions(ctx, dataDir, rich);
	result = attachTraceReasons(result, ctx, rich, dataDir);
	refreshPredictCache(ctx, dataDir, rich);
	return result;
}

export async function refreshPredictCacheEnriched(
	ctx: LiveContext,
	dataDir?: string,
): Promise<PredictResult> {
	const enrichment = await gatherPredictEnrichment();
	const result = refreshPredictCache(ctx, dataDir, enrichment);
	return attachTraceReasons(result, ctx, enrichment, dataDir);
}
