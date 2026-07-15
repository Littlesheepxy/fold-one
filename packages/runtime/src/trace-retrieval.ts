import type { ActionPlan } from "@fold/ai";
import type { LiveContext } from "@fold/context";
import { formatEntityBrief, listRecentEpisodes, type Episode } from "@fold/memory";
import {
	buildSituationFingerprint,
	episodeSituationFingerprint,
	similarityScore,
	type SituationFingerprint,
} from "./predict.js";

export interface EpisodeTrace {
	episodeId: string;
	intent: string;
	goal: string;
	thinkingSnippet: string;
	planSteps: string[];
	score: number;
}

function parseJson<T>(raw: string | undefined | null, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function traceFromEpisode(ep: Episode, score: number): EpisodeTrace | null {
	if (!ep.intent?.trim()) return null;
	const plan = parseJson<ActionPlan | null>(ep.planJson, null);
	const steps =
		plan?.steps.map((s) => s.skill).filter(Boolean).slice(0, 6) ?? [];
	const thinking = ep.thinkingText?.trim() ?? "";
	const thinkingSnippet = thinking
		.split("\n")
		.filter((l) => l.trim() && !l.startsWith("将执行"))
		.slice(0, 2)
		.join(" ")
		.slice(0, 160);

	return {
		episodeId: ep.id,
		intent: ep.intent.trim(),
		goal: plan?.goal?.trim() || ep.goal?.trim() || ep.intent.trim(),
		thinkingSnippet,
		planSteps: steps,
		score,
	};
}

/** LongNAP 轻量版：按情境指纹检索相似 episode 的推理轨迹。 */
export function retrieveSimilarTraces(
	ctx: LiveContext,
	dataDir?: string,
	limit = 3,
	enrichment: { entities?: string[] } = {},
): EpisodeTrace[] {
	const fp = buildSituationFingerprint(ctx, enrichment);
	const now = Date.now();

	return listRecentEpisodes(40, dataDir)
		.map((ep) => {
			const epFp = episodeSituationFingerprint(ep);
			if (!epFp) return null;
			const raw = similarityScore(fp, epFp);
			const days = (now - ep.timestamp) / (24 * 3600 * 1000);
			const score = raw * Math.exp(-days / 10);
			return score > 0.22 ? { ep, score } : null;
		})
		.filter((row): row is { ep: Episode; score: number } => row != null)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ ep, score }) => traceFromEpisode(ep, score))
		.filter((t): t is EpisodeTrace => t != null);
}

export function formatTracesForPlanner(traces: EpisodeTrace[]): string {
	if (!traces.length) return "";
	return traces
		.map((t) => {
			const steps = t.planSteps.length ? `步骤：${t.planSteps.join(" → ")}` : "";
			const think = t.thinkingSnippet ? `思路：${t.thinkingSnippet}` : "";
			return `- [情境相似 ${(t.score * 100).toFixed(0)}%] ${t.intent} → ${t.goal}${steps ? `；${steps}` : ""}${think ? `；${think}` : ""}`;
		})
		.join("\n");
}

/** 供 planner 注入：意图匹配 + 情境 trace 双路检索。 */
export function formatPlannerMemory(
	intent: string,
	ctx: LiveContext,
	intentEpisodes: string,
	dataDir?: string,
): string {
	const traces = formatTracesForPlanner(retrieveSimilarTraces(ctx, dataDir, 3));
	const entities = formatEntityBrief(dataDir, { matchText: intent });
	const blocks = [intentEpisodes, traces, entities].filter((b) => b.trim());
	return blocks.join("\n\n");
}

// re-export for tests
export type { SituationFingerprint };
