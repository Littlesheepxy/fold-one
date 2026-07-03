import type { LiveContext } from "@fold/context";
import { listRecentEpisodes, type Episode, type EpisodeSummary } from "@fold/memory";
import { extractEntityTokens } from "./entity-extract.js";
import {
	anchorFromObjects,
	resolveInformationObjects,
	type InformationObjectInput,
} from "./information-object.js";
import { matchRoutinesForTrail, mineRoutinesFromEpisodes } from "./routine-mining.js";

export type PredictMode = "silent" | "fast" | "full";

export interface SituationFingerprint {
	apps: string[];
	urlHosts: string[];
	windowTitles: string[];
	fileKinds: string[];
	objectKeys: string[];
	entities: string[];
	trail: string[];
}

export interface PredictSuggestion {
	intent: string;
	label: string;
	confidence: number;
	reason: string;
	sourceEpisodeId?: string;
}

export interface PredictResult {
	mode: PredictMode;
	anchor: string | null;
	suggestions: PredictSuggestion[];
	computedAt: number;
}

export type PredictEnrichment = InformationObjectInput;

const SILENT_THRESHOLD = 0.32;
const FAST_THRESHOLD = 0.55;
const CACHE_TTL_MS = 90_000;

let predictCache: { key: string; result: PredictResult; at: number } | null = null;

function parseJson<T>(raw: string | undefined | null, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function hostFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function fileKind(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	return ext || "file";
}

function dedupeTrail(items: string[]): string[] {
	const out: string[] = [];
	for (const item of items) {
		const v = item.trim();
		if (!v) continue;
		if (out[out.length - 1] === v) continue;
		out.push(v);
	}
	return out;
}

function jaccardScore(a: string[], b: string[]): number {
	const A = new Set(a.map((s) => s.toLowerCase()).filter(Boolean));
	const B = new Set(b.map((s) => s.toLowerCase()).filter(Boolean));
	if (A.size === 0 && B.size === 0) return 0;
	let inter = 0;
	for (const x of A) if (B.has(x)) inter++;
	const union = A.size + B.size - inter;
	return union > 0 ? inter / union : 0;
}

function trailOverlap(a: string[], b: string[]): number {
	const tailA = a.slice(-8);
	const tailB = b.slice(-8);
	if (!tailA.length || !tailB.length) return 0;
	let best = 0;
	for (let len = Math.min(tailA.length, tailB.length); len >= 2; len--) {
		const segA = tailA.slice(-len).join("\0");
		const segB = tailB.slice(-len).join("\0");
		if (segA === segB) {
			best = len / Math.max(tailA.length, tailB.length);
			break;
		}
	}
	if (best > 0) return best;
	return jaccardScore(tailA, tailB) * 0.6;
}

function recencyWeight(timestamp: number, now = Date.now()): number {
	const days = (now - timestamp) / (24 * 3600 * 1000);
	return Math.exp(-days / 10);
}

function screenKeywords(text: string): string[] {
	return text
		.split(/\r?\n/)
		.flatMap((line) => line.split(/[^\p{L}\p{N}]+/u))
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length >= 3)
		.slice(0, 24);
}

export function buildSituationFingerprint(
	ctx: LiveContext,
	enrichment: PredictEnrichment = {},
): SituationFingerprint {
	const objects = resolveInformationObjects(ctx, enrichment);
	const apps = new Set<string>();
	const urlHosts = new Set<string>();
	const windowTitles = new Set<string>();
	const fileKinds = new Set<string>();
	const objectKeys = new Set<string>();
	const entities = new Set<string>(enrichment.entities ?? []);
	const trail: string[] = [];

	for (const obj of objects) {
		objectKeys.add(obj.id);
		windowTitles.add(obj.title);
		if (obj.host) urlHosts.add(obj.host);
		if (obj.app) apps.add(obj.app);
		if (obj.kind === "document" || obj.kind === "file") fileKinds.add(obj.kind);
	}

	if (ctx.activeApp) apps.add(ctx.activeApp);
	if (ctx.activeWindow) windowTitles.add(ctx.activeWindow);

	for (const u of ctx.recentUrls.slice(0, 8)) {
		const host = hostFromUrl(u.url);
		if (host) urlHosts.add(host);
		if (u.title) windowTitles.add(u.title);
	}
	for (const f of ctx.recentFiles.slice(0, 6)) {
		fileKinds.add(fileKind(f.path));
	}

	for (const evt of ctx.events) {
		if (evt.type === "app.active" && evt.data.appName) {
			apps.add(evt.data.appName);
			trail.push(evt.data.appName);
			if (evt.data.windowTitle) windowTitles.add(evt.data.windowTitle);
		}
		if (evt.type === "browser.urlChanged" && evt.data.url) {
			const host = hostFromUrl(evt.data.url);
			if (host) urlHosts.add(host);
			if (evt.data.windowTitle) windowTitles.add(evt.data.windowTitle);
			trail.push(host || "web");
		}
		if (evt.type === "file.created" && evt.data.filePath) {
			fileKinds.add(fileKind(evt.data.filePath));
			trail.push("file");
		}
	}

	if (enrichment.screenText) {
		for (const kw of screenKeywords(enrichment.screenText)) {
			windowTitles.add(kw);
		}
		for (const e of extractEntityTokens(enrichment.screenText)) entities.add(e);
	}
	if (enrichment.accessibilityText) {
		for (const kw of screenKeywords(enrichment.accessibilityText)) {
			windowTitles.add(kw);
		}
		for (const e of extractEntityTokens(enrichment.accessibilityText)) entities.add(e);
	}
	if (ctx.clipboard?.text) {
		for (const e of extractEntityTokens(ctx.clipboard.text)) entities.add(e);
	}

	return {
		apps: [...apps],
		urlHosts: [...urlHosts],
		windowTitles: [...windowTitles],
		fileKinds: [...fileKinds],
		objectKeys: [...objectKeys],
		entities: [...entities],
		trail: dedupeTrail(trail),
	};
}

/** 供 trace 检索等模块复用 */
export function episodeSituationFingerprint(ep: Episode): SituationFingerprint | null {
	if ((ep.status ?? "").toLowerCase() !== "success") return null;
	const summary = parseJson<EpisodeSummary | null>(ep.summaryJson, null);
	const events = parseJson<Array<{ type?: string; data?: Record<string, string> }>>(
		ep.contextEventsJson,
		[],
	);

	const apps = new Set<string>(summary?.apps ?? []);
	const urlHosts = new Set<string>();
	const windowTitles = new Set<string>();
	const fileKinds = new Set<string>();
	const objectKeys = new Set<string>();
	const entities = new Set<string>(
		extractEntityTokens(ep.intent, ep.thinkingText, ep.summary),
	);
	const trail: string[] = [];

	for (const url of summary?.urls ?? []) {
		const host = hostFromUrl(url);
		if (host) {
			urlHosts.add(host);
			objectKeys.add(`web:${host}`);
		}
	}
	for (const path of summary?.files ?? []) {
		fileKinds.add(fileKind(path));
		objectKeys.add(`file:${path.split("/").pop() ?? path}`);
	}

	for (const evt of events) {
		if (evt.type === "app.active" && evt.data?.appName) {
			apps.add(evt.data.appName);
			trail.push(evt.data.appName);
			if (evt.data.windowTitle) windowTitles.add(evt.data.windowTitle);
		}
		if (evt.type === "browser.urlChanged" && evt.data?.url) {
			const host = hostFromUrl(evt.data.url);
			if (host) urlHosts.add(host);
			trail.push(host || "web");
		}
	}

	return {
		apps: [...apps],
		urlHosts: [...urlHosts],
		windowTitles: [...windowTitles],
		fileKinds: [...fileKinds],
		objectKeys: [...objectKeys],
		entities: [...entities],
		trail: dedupeTrail(trail),
	};
}

export function similarityScore(a: SituationFingerprint, b: SituationFingerprint): number {
	const appScore = jaccardScore(a.apps, b.apps);
	const hostScore = jaccardScore(a.urlHosts, b.urlHosts);
	const titleScore = jaccardScore(a.windowTitles, b.windowTitles) * 0.7;
	const fileScore = jaccardScore(a.fileKinds, b.fileKinds) * 0.5;
	const objectScore = jaccardScore(a.objectKeys, b.objectKeys) * 0.85;
	const entityScore = jaccardScore(a.entities, b.entities) * 0.9;
	const trailScore = trailOverlap(a.trail, b.trail);
	return (
		appScore * 0.2 +
		hostScore * 0.2 +
		titleScore * 0.1 +
		fileScore * 0.05 +
		objectScore * 0.12 +
		entityScore * 0.13 +
		trailScore * 0.2
	);
}

function normalizeIntentKey(intent: string): string {
	return intent
		.replace(/[「」""][^「」""]+[「」""]/g, "〈…〉")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 100);
}

function shortLabel(intent: string): string {
	const t = intent.trim();
	if (t.length <= 36) return t;
	return `${t.slice(0, 35)}…`;
}

function formatEpisodeTime(ts: number): string {
	return new Date(ts).toLocaleString("zh-CN", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

interface ScoredEpisode {
	episode: Episode;
	score: number;
}

function rankSimilarEpisodes(fp: SituationFingerprint, dataDir?: string): ScoredEpisode[] {
	const now = Date.now();
	return listRecentEpisodes(40, dataDir)
		.map((ep) => {
			const epFp = episodeSituationFingerprint(ep);
			if (!epFp) return null;
			const raw = similarityScore(fp, epFp);
			const score = raw * (0.65 + 0.35 * recencyWeight(ep.timestamp, now));
			return score > 0.18 ? { episode: ep, score } : null;
		})
		.filter((row): row is ScoredEpisode => row != null)
		.sort((a, b) => b.score - a.score);
}

function modeFromTopScore(top: number): PredictMode {
	if (top < SILENT_THRESHOLD) return "silent";
	if (top < FAST_THRESHOLD) return "fast";
	return "full";
}

function maxSuggestions(mode: PredictMode): number {
	if (mode === "fast") return 1;
	if (mode === "full") return 3;
	return 0;
}

function mergeSuggestions(
	episodeRows: PredictSuggestion[],
	routineRows: Array<{ intent: string; confidence: number; reason: string }>,
): PredictSuggestion[] {
	const byKey = new Map<string, PredictSuggestion>();

	for (const row of episodeRows) {
		const key = normalizeIntentKey(row.intent);
		const existing = byKey.get(key);
		if (!existing || row.confidence > existing.confidence) {
			byKey.set(key, row);
		}
	}

	for (const row of routineRows) {
		const key = normalizeIntentKey(row.intent);
		const existing = byKey.get(key);
		const merged: PredictSuggestion = {
			intent: row.intent,
			label: shortLabel(row.intent),
			confidence: row.confidence,
			reason: row.reason,
		};
		if (!existing) {
			byKey.set(key, merged);
			continue;
		}
		// 同 intent：取更高置信，理由优先 routine 文案
		if (row.confidence > existing.confidence * 0.9) {
			byKey.set(key, {
				...existing,
				confidence: Math.max(existing.confidence, row.confidence),
				reason: row.reason,
			});
		}
	}

	return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

export function buildPredictions(
	ctx: LiveContext,
	dataDir?: string,
	enrichment: PredictEnrichment = {},
): PredictResult {
	const objects = resolveInformationObjects(ctx, enrichment);
	const anchor = anchorFromObjects(objects, ctx, enrichment);
	const fp = buildSituationFingerprint(ctx, enrichment);
	const ranked = rankSimilarEpisodes(fp, dataDir);
	const routines = mineRoutinesFromEpisodes(dataDir);
	const routineMatches = matchRoutinesForTrail(fp.trail, routines);

	const episodeSuggestions: PredictSuggestion[] = [];
	for (const { episode, score } of ranked) {
		if (!episode.intent?.trim()) continue;
		episodeSuggestions.push({
			intent: episode.intent.trim(),
			label: shortLabel(episode.intent),
			confidence: Math.min(0.98, score),
			reason: `与 ${formatEpisodeTime(episode.timestamp)} 的成功任务情境相似`,
			sourceEpisodeId: episode.id,
		});
		if (episodeSuggestions.length >= 3) break;
	}

	const suggestions = mergeSuggestions(episodeSuggestions, routineMatches);
	const topScore = suggestions[0]?.confidence ?? 0;
	const mode = modeFromTopScore(topScore);
	const limit = maxSuggestions(mode);

	return {
		mode,
		anchor,
		suggestions: suggestions.slice(0, limit),
		computedAt: Date.now(),
	};
}

/** 有 AX 文本时尚未校准则再 OCR。 */
export function needsScreenCalibration(
	result: PredictResult,
	enrichment: PredictEnrichment = {},
): boolean {
	if (enrichment.accessibilityText && enrichment.accessibilityText.length > 80) {
		if (result.mode === "full") return false;
		if (result.mode === "fast" && (result.suggestions[0]?.confidence ?? 0) >= 0.4) {
			return false;
		}
	}
	if (result.mode === "silent") return true;
	if (result.mode === "fast" && (result.suggestions[0]?.confidence ?? 0) < 0.45) return true;
	return false;
}

export function getPredictCacheKey(ctx: LiveContext, enrichment: PredictEnrichment = {}): string {
	const fp = buildSituationFingerprint(ctx, enrichment);
	return JSON.stringify({
		a: fp.apps.slice(0, 5),
		h: fp.urlHosts.slice(0, 5),
		t: fp.trail.slice(-6),
		o: fp.objectKeys.slice(0, 4),
		e: fp.entities.slice(0, 6),
	});
}

export function refreshPredictCache(
	ctx: LiveContext,
	dataDir?: string,
	enrichment: PredictEnrichment = {},
): PredictResult {
	const result = buildPredictions(ctx, dataDir, enrichment);
	predictCache = { key: getPredictCacheKey(ctx, enrichment), result, at: Date.now() };
	return result;
}

export function getPredictions(
	ctx: LiveContext,
	dataDir?: string,
	enrichment: PredictEnrichment = {},
): PredictResult {
	const key = getPredictCacheKey(ctx, enrichment);
	if (predictCache && predictCache.key === key && Date.now() - predictCache.at < CACHE_TTL_MS) {
		return predictCache.result;
	}
	return refreshPredictCache(ctx, dataDir, enrichment);
}

export function clearPredictCache(): void {
	predictCache = null;
}
