import { captureScreenshot } from "@fold/connectors";
import { createEmptyContext, type LiveContext } from "@fold/context";
import {
	buildPredictions,
	enrichContext,
	extractEntityTokens,
	generateAhaGuess,
	generatePredictDrafts,
	getPredictions,
	inferPredictSurface,
	needsScreenCalibration,
	predictContextSnippet,
	refreshPredictCache,
	retrieveSimilarTraces,
	streamAhaGuess,
	type EnrichedContext,
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

function draftInputFromEnriched(
	enriched: EnrichedContext,
	extra?: { intent?: string; surface?: Parameters<typeof generatePredictDrafts>[0]["surface"]; anchor?: string },
) {
	return {
		contextSnippet: enriched.screenSnippet || undefined,
		contextSummary: enriched.summary,
		contextBrief: enriched.brief,
		confidenceLevel: enriched.confidence.level,
		...extra,
	};
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

/** @deprecated 使用 enrichContext(ctx, scope) */
export async function gatherPredictEnrichment(ctx?: LiveContext): Promise<PredictEnrichment> {
	const { enrichment } = await enrichContext(ctx ?? createEmptyContext(), "predict");
	return enrichment;
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

async function enrichWithOptionalOcr(
	ctx: LiveContext,
	scope: Parameters<typeof enrichContext>[1],
	targetApp?: string | null,
): Promise<EnrichedContext> {
	const base = await enrichContext(ctx, scope, { targetApp });
	const screenText = await screenTextViaOcr();
	if (!screenText) return base;

	const enrichment: PredictEnrichment = {
		...base.enrichment,
		screenText,
		entities: [
			...new Set([
				...(base.enrichment.entities ?? []),
				...extractEntityTokens(screenText),
			]),
		],
	};
	return {
		...base,
		enrichment,
		screenSnippet: predictContextSnippet(enrichment),
	};
}

async function attachDraftsIfNeeded(
	result: PredictResult,
	ctx: LiveContext,
	enriched: EnrichedContext,
): Promise<PredictResult> {
	if (result.phase !== "result" || !result.suggestions[0]) return result;
	const top = result.suggestions[0];
	const drafts = await generateTieredPredictDrafts({
		intent: top.intent,
		surface: result.surface,
		anchor: result.anchor,
		...draftInputFromEnriched(enriched),
	});
	return { ...result, drafts };
}

export async function resolvePredictions(ctx: LiveContext, dataDir?: string): Promise<PredictResult> {
	const enriched = await enrichContext(ctx, "predict");
	const { enrichment } = enriched;
	lastPredictTargetApp = enrichment.accessibilityApp ?? ctx.activeApp ?? null;
	let result = getPredictions(ctx, dataDir, enrichment);
	result = attachTraceReasons(result, ctx, enrichment, dataDir);

	if (!needsScreenCalibration(result, enrichment)) {
		return attachDraftsIfNeeded(result, ctx, enriched);
	}

	const screenText = await screenTextViaOcr();
	if (!screenText) return attachDraftsIfNeeded(result, ctx, enriched);

	const richEnrichment: PredictEnrichment = {
		...enrichment,
		screenText,
		entities: [...new Set([...(enrichment.entities ?? []), ...extractEntityTokens(screenText)])],
	};
	const richEnriched: EnrichedContext = {
		...enriched,
		enrichment: richEnrichment,
		screenSnippet: predictContextSnippet(richEnrichment),
	};
	result = buildPredictions(ctx, dataDir, richEnrichment);
	result = attachTraceReasons(result, ctx, richEnrichment, dataDir);
	refreshPredictCache(ctx, dataDir, richEnrichment);
	return attachDraftsIfNeeded(result, ctx, richEnriched);
}

export async function resolveReplyPredictions(
	ctx: LiveContext,
	targetApp?: string | null,
): Promise<PredictResult> {
	const enriched = await enrichWithOptionalOcr(ctx, "reply", targetApp);
	const { enrichment } = enriched;
	lastPredictTargetApp = enrichment.accessibilityApp ?? targetApp ?? ctx.activeApp ?? null;
	const intent = "帮我回复当前对话";
	const anchor =
		extractChatSceneTitle(
			enrichment.accessibilityWindowTitle ?? ctx.activeWindow,
			enrichment.accessibilityText,
		) ??
		enrichment.accessibilityApp ??
		ctx.activeApp ??
		"当前对话";
	const drafts = await generateTieredPredictDrafts({
		intent,
		surface: "reply",
		anchor,
		...draftInputFromEnriched(enriched),
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
	const base = await enrichContext(ctx, "predict");
	const enriched: EnrichedContext = enrichment
		? {
				...base,
				enrichment,
				screenSnippet: predictContextSnippet(enrichment),
			}
		: base;
	const surface = inferPredictSurface(ctx, enriched.enrichment, intent);
	const drafts = await generateTieredPredictDrafts({
		intent,
		surface,
		...draftInputFromEnriched(enriched),
	});
	return { surface, drafts };
}

export async function resolveReplyDraftsForInstruction(
	ctx: LiveContext,
	intent: string,
): Promise<NonNullable<PredictResult["drafts"]>> {
	const card = await resolveReplyVoiceCard(ctx, intent);
	return card.drafts;
}

export function formatReplyScene(
	appName: string | null | undefined,
	windowTitle: string | null | undefined,
	accessibilityText?: string | null,
): { sceneTitle: string; subtitle: string | null } {
	const app = appName?.trim() || null;
	const window = extractChatSceneTitle(windowTitle, accessibilityText);
	if (window && app) {
		return { sceneTitle: window, subtitle: app };
	}
	return { sceneTitle: window ?? app ?? "当前对话", subtitle: null };
}

/** 飞书/Lark 等 IM 的 window 1 标题常为「发送给 xxx」，需从 AX 树推断当前会话名 */
function extractChatSceneTitle(
	windowTitle: string | null | undefined,
	accessibilityText?: string | null,
): string | null {
	const title = windowTitle?.trim() || null;
	if (title && !/^发送给\s/i.test(title)) return title;

	const skip = /^(发送给|搜索|消息|联系人|发送|更多|表情|文件|截图|语音|视频|@|回复|转发)$/i;
	const lines = (accessibilityText ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	for (const line of lines.slice(0, 48)) {
		if (line.length < 2 || line.length > 80) continue;
		if (/^发送给\s/i.test(line)) continue;
		if (skip.test(line)) continue;
		if (/^\d{1,2}:\d{2}$/.test(line)) continue;
		return line;
	}
	return title;
}

export async function resolveReplyVoiceCard(
	ctx: LiveContext,
	intent: string,
	targetApp?: string | null,
): Promise<{
	drafts: NonNullable<PredictResult["drafts"]>;
	anchor: string;
	sceneTitle: string;
	subtitle: string | null;
	appName: string | null;
	appPath: string | null;
}> {
	const enriched = await enrichWithOptionalOcr(ctx, "reply", targetApp);
	const { enrichment } = enriched;
	const appName = enrichment.accessibilityApp ?? targetApp ?? ctx.activeApp ?? null;
	const windowTitle = enrichment.accessibilityWindowTitle ?? ctx.activeWindow ?? null;
	const { sceneTitle, subtitle } = formatReplyScene(
		appName,
		windowTitle,
		enrichment.accessibilityText,
	);
	lastPredictTargetApp = appName;
	const anchor = sceneTitle;
	const drafts = await generateTieredPredictDrafts({
		intent,
		surface: "reply",
		anchor,
		...draftInputFromEnriched(enriched),
	});
	return {
		drafts,
		anchor,
		sceneTitle,
		subtitle,
		appName,
		appPath: ctx.activeAppPath ?? null,
	};
}

export async function refreshPredictCacheEnriched(
	ctx: LiveContext,
	dataDir?: string,
): Promise<PredictResult> {
	const { enrichment } = await enrichContext(ctx, "predict");
	const result = refreshPredictCache(ctx, dataDir, enrichment);
	return attachTraceReasons(result, ctx, enrichment, dataDir);
}

export interface HomePredictPreview {
	anchor: string | null;
	phase: PredictResult["phase"];
	activeApp: string | null;
	activeWindow: string | null;
	suggestions: Array<{
		label: string;
		intent: string;
		reason: string;
		confidence: number;
	}>;
}

export interface HomeAhaGuess {
	reply: string;
	confidenceLevel?: "high" | "medium" | "low";
	confidenceScore?: number;
	suggestions: Array<{
		label: string;
		intent: string;
		reason: string;
		confidence: number;
	}>;
}

async function buildAhaGuessPayload(ctx: LiveContext, dataDir?: string) {
	const enriched = await enrichContext(ctx, "aha");
	const { enrichment } = enriched;
	const result = attachTraceReasons(
		getPredictions(ctx, dataDir, enrichment),
		ctx,
		enrichment,
		dataDir,
	);
	const top = result.suggestions[0];

	const recentPages = [
		...ctx.recentUrls.map((u) => ({ title: u.title || u.url, url: u.url })),
		...ctx.events
			.filter((e) => e.type === "browser.urlChanged" && e.data.url)
			.map((e) => ({
				title: e.data.windowTitle || e.data.url || "",
				url: e.data.url!,
			})),
	]
		.filter((page, index, all) => all.findIndex((p) => p.url === page.url) === index)
		.slice(0, 10);

	const appTrail = ctx.events
		.filter((e) => e.type === "app.active" && e.data.appName)
		.map((e) => ({
			app: e.data.appName!,
			window: e.data.windowTitle,
		}))
		.slice(-10);

	const chromeTabs = (enrichment.chromeTabs ?? []).map((tab) => ({
		title: tab.title || tab.url,
		url: tab.url,
	}));

	const suggestions = result.suggestions.slice(0, 3).map((s) => ({
		label: s.label,
		intent: s.intent,
		reason: s.reason,
		confidence: s.confidence,
	}));

	const input = {
		activeApp: enrichment.accessibilityApp ?? ctx.activeApp ?? null,
		activeWindow: enrichment.accessibilityWindowTitle ?? ctx.activeWindow ?? null,
		anchor: result.anchor,
		trail: appTrail.map((step) => step.app).slice(-6),
		recentPages,
		appTrail,
		chromeTabs,
		contextSnippet: enriched.screenSnippet || undefined,
		contextBrief: enriched.brief,
		confidenceLevel: enriched.confidence.level,
		confidenceScore: enriched.confidence.score,
		topSuggestion: top
			? { label: top.label, intent: top.intent, reason: top.reason }
			: null,
	};

	return {
		input,
		suggestions,
		confidence: enriched.confidence,
		access: resolveSmartActionAccess(),
	};
}

export async function streamAhaGuessForHome(
	ctx: LiveContext,
	dataDir: string | undefined,
	onChunk: (chunk: string) => void,
	isCancelled: () => boolean,
): Promise<HomeAhaGuess> {
	const { input, suggestions, confidence, access } = await buildAhaGuessPayload(ctx, dataDir);
	const reply = await streamAhaGuess(input, {
		allowCloud: access.allowed,
		onCloudSuccess: access.usesTrial ? () => consumeSmartActionTrial() : undefined,
		onChunk,
		isCancelled,
	});
	return {
		reply,
		suggestions,
		confidenceLevel: confidence.level,
		confidenceScore: confidence.score,
	};
}

export async function resolveAhaGuess(
	ctx: LiveContext,
	dataDir?: string,
): Promise<HomeAhaGuess> {
	const { input, suggestions, confidence, access } = await buildAhaGuessPayload(ctx, dataDir);
	const reply = await generateAhaGuess(input, {
		allowCloud: access.allowed,
		onCloudSuccess: access.usesTrial ? () => consumeSmartActionTrial() : undefined,
	});
	return {
		reply,
		suggestions,
		confidenceLevel: confidence.level,
		confidenceScore: confidence.score,
	};
}

export async function getPredictPreviewForHome(
	ctx: LiveContext,
	dataDir?: string,
): Promise<HomePredictPreview> {
	const { enrichment } = await enrichContext(ctx, "predict");
	const result = attachTraceReasons(
		getPredictions(ctx, dataDir, enrichment),
		ctx,
		enrichment,
		dataDir,
	);
	return {
		anchor: result.anchor,
		phase: result.phase,
		activeApp: enrichment.accessibilityApp ?? ctx.activeApp ?? null,
		activeWindow: enrichment.accessibilityWindowTitle ?? ctx.activeWindow ?? null,
		suggestions: result.suggestions.slice(0, 3).map((s) => ({
			label: s.label,
			intent: s.intent,
			reason: s.reason,
			confidence: s.confidence,
		})),
	};
}
