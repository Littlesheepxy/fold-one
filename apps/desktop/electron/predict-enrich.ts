import {
	captureScreenshot,
	listChromeTabsViaAppleScript,
	readFrontWindowAccessibilityText,
} from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import {
	buildPredictions,
	extractEntityTokens,
	generatePredictDrafts,
	getPredictions,
	inferPredictSurface,
	needsScreenCalibration,
	predictContextSnippet,
	refreshPredictCache,
	retrieveSimilarTraces,
	type PredictEnrichment,
	type PredictResult,
} from "@fold/runtime";
import {
	consumeSmartActionTrial,
	resolveSmartActionAccess,
} from "./config.js";

async function generateTieredPredictDrafts(
	input: Parameters<typeof generatePredictDrafts>[0],
) {
	const access = resolveSmartActionAccess();
	return generatePredictDrafts({
		...input,
		allowCloud: access.allowed,
		onCloudSuccess: access.usesTrial
			? () => {
					consumeSmartActionTrial();
				}
			: undefined,
	});
}

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

let lastPredictTargetApp: string | null = null;

export function getPredictTargetApp(): string | null {
	return lastPredictTargetApp;
}

export function setPredictTargetApp(app: string | null | undefined): void {
	lastPredictTargetApp = app?.trim() || null;
}

export function clearPredictTargetApp(): void {
	lastPredictTargetApp = null;
}

export async function gatherPredictEnrichment(): Promise<PredictEnrichment> {
	const [chromeTabs, ax] = await Promise.all([
		listChromeTabsViaAppleScript().catch(() => []),
		readFrontWindowAccessibilityText().catch(() => null),
	]);
	const accessibilityText = ax?.text;
	const entities = extractEntityTokens(accessibilityText);
	return {
		chromeTabs,
		accessibilityText,
		accessibilityApp: ax?.app,
		accessibilityWindowTitle: ax?.windowTitle,
		entities,
	};
}

async function screenTextViaOcr(): Promise<string | undefined> {
	if (!resolveSmartActionAccess().allowed) return undefined;
	if (!process.env.ZHIPU_API_KEY?.trim()) return undefined;
	try {
		const shot = await captureScreenshot({ target: "frontmost" });
		const { extractPdfWithZhipuOcr } = await import("@fold/skills");
		const ocr = await extractPdfWithZhipuOcr(shot.path);
		const text = ocr.rawText?.trim();
		return text ? text.slice(0, 2500) : undefined;
	} catch {
		return undefined;
	}
}

async function attachDraftsIfNeeded(
	result: PredictResult,
	enrichment: PredictEnrichment,
): Promise<PredictResult> {
	if (result.phase !== "result" || !result.suggestions[0]) return result;
	const top = result.suggestions[0];
	const drafts = await generateTieredPredictDrafts({
		intent: top.intent,
		surface: result.surface,
		contextSnippet: predictContextSnippet(enrichment) || undefined,
		anchor: result.anchor,
	});
	return { ...result, drafts };
}

export async function resolvePredictions(ctx: LiveContext, dataDir?: string): Promise<PredictResult> {
	const enrichment = await gatherPredictEnrichment();
	lastPredictTargetApp = enrichment.accessibilityApp ?? ctx.activeApp ?? null;
	let result = getPredictions(ctx, dataDir, enrichment);
	result = attachTraceReasons(result, ctx, enrichment, dataDir);

	if (!needsScreenCalibration(result, enrichment)) {
		return attachDraftsIfNeeded(result, enrichment);
	}

	const screenText = await screenTextViaOcr();
	if (!screenText) return attachDraftsIfNeeded(result, enrichment);

	const rich = {
		...enrichment,
		screenText,
		entities: [...new Set([...(enrichment.entities ?? []), ...extractEntityTokens(screenText)])],
	};
	result = buildPredictions(ctx, dataDir, rich);
	result = attachTraceReasons(result, ctx, rich, dataDir);
	refreshPredictCache(ctx, dataDir, rich);
	return attachDraftsIfNeeded(result, rich);
}

export async function resolveReplyPredictions(ctx: LiveContext): Promise<PredictResult> {
	const enrichment = await gatherPredictEnrichment();
	lastPredictTargetApp = enrichment.accessibilityApp ?? ctx.activeApp ?? null;
	const intent = "帮我回复当前对话";
	const anchor =
		enrichment.accessibilityWindowTitle ??
		enrichment.accessibilityApp ??
		ctx.activeWindow ??
		ctx.activeApp ??
		"当前对话";
	const drafts = await generateTieredPredictDrafts({
		intent,
		surface: "reply",
		contextSnippet: predictContextSnippet(enrichment) || enrichment.accessibilityText,
		anchor,
	});
	return {
		mode: "full",
		phase: "result",
		surface: "reply",
		anchor,
		suggestions: [
			{
				intent,
				label: "替我回复",
				confidence: 0.88,
				reason: "长按右⌘",
			},
		],
		drafts,
		topConfidence: 0.88,
		computedAt: Date.now(),
	};
}

export async function resolvePredictDraftsForIntent(
	ctx: LiveContext,
	intent: string,
	enrichment?: PredictEnrichment,
): Promise<{ surface: PredictResult["surface"]; drafts: NonNullable<PredictResult["drafts"]> }> {
	const rich = enrichment ?? (await gatherPredictEnrichment());
	const surface = inferPredictSurface(ctx, rich, intent);
	const drafts = await generateTieredPredictDrafts({
		intent,
		surface,
		contextSnippet: predictContextSnippet(rich) || undefined,
	});
	return { surface, drafts };
}

export async function resolveReplyDraftsForInstruction(
	ctx: LiveContext,
	intent: string,
): Promise<NonNullable<PredictResult["drafts"]>> {
	const enrichment = await gatherPredictEnrichment();
	const screenText = await screenTextViaOcr();
	const rich = screenText
		? {
				...enrichment,
				screenText,
				entities: [...new Set([...(enrichment.entities ?? []), ...extractEntityTokens(screenText)])],
			}
		: enrichment;
	lastPredictTargetApp = rich.accessibilityApp ?? ctx.activeApp ?? null;
	return generateTieredPredictDrafts({
		intent,
		surface: "reply",
		contextSnippet: predictContextSnippet(rich) || rich.accessibilityText,
		anchor: rich.accessibilityWindowTitle ?? rich.accessibilityApp ?? ctx.activeWindow ?? ctx.activeApp,
	});
}

export async function refreshPredictCacheEnriched(
	ctx: LiveContext,
	dataDir?: string,
): Promise<PredictResult> {
	const enrichment = await gatherPredictEnrichment();
	const result = refreshPredictCache(ctx, dataDir, enrichment);
	return attachTraceReasons(result, ctx, enrichment, dataDir);
}
