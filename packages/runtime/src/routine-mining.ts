import { listRecentEpisodes, type Episode, type EpisodeSummary } from "@fold/memory";

export interface MinedRoutine {
	/** 轨迹 token 序列，如 app:Chrome>host:baike.baidu.com */
	pattern: string;
	intent: string;
	count: number;
	/** 0–1，出现次数与轨迹长度加权 */
	confidence: number;
}

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

function dedupeTrail(items: string[]): string[] {
	const out: string[] = [];
	for (const item of items) {
		if (!item) continue;
		if (out[out.length - 1] === item) continue;
		out.push(item);
	}
	return out;
}

/** 从 episode 上下文抽出标准化轨迹 token。 */
export function trailTokensFromEpisode(ep: Episode): string[] {
	const summary = parseJson<EpisodeSummary | null>(ep.summaryJson, null);
	const events = parseJson<Array<{ type?: string; data?: Record<string, string> }>>(
		ep.contextEventsJson,
		[],
	);
	const tokens: string[] = [];

	for (const evt of events) {
		if (evt.type === "app.active" && evt.data?.appName) {
			tokens.push(`app:${evt.data.appName}`);
		}
		if (evt.type === "browser.urlChanged" && evt.data?.url) {
			const host = hostFromUrl(evt.data.url);
			if (host) tokens.push(`host:${host}`);
		}
		if (evt.type === "file.created" && evt.data?.filePath) {
			tokens.push("event:file");
		}
	}

	if (tokens.length === 0 && summary?.apps?.length) {
		for (const app of summary.apps.slice(0, 4)) tokens.push(`app:${app}`);
	}
	for (const url of summary?.urls ?? []) {
		const host = hostFromUrl(url);
		if (host) tokens.push(`host:${host}`);
	}

	return dedupeTrail(tokens);
}

function trailTokensFromLive(trail: string[]): string[] {
	return trail.map((t) => {
		if (t.includes(".")) return `host:${t.replace(/^www\./, "")}`;
		if (t === "file" || t === "web") return `event:${t}`;
		return `app:${t}`;
	});
}

/**
 * 从无标注 episode 序列挖掘频繁 routine（RPM 轻量版）。
 * 取每条成功任务轨迹的后缀 n-gram，统计重复模式。
 */
export function mineRoutinesFromEpisodes(dataDir?: string, minCount = 2): MinedRoutine[] {
	const episodes = listRecentEpisodes(50, dataDir).filter(
		(ep) => (ep.status ?? "").toLowerCase() === "success" && ep.intent?.trim(),
	);

	const buckets = new Map<string, { count: number; intents: Map<string, number> }>();

	for (const ep of episodes) {
		const tokens = trailTokensFromEpisode(ep);
		if (tokens.length < 2) continue;
		const intent = ep.intent.trim();
		for (let len = 2; len <= Math.min(5, tokens.length); len++) {
			const suffix = tokens.slice(-len).join(">");
			const row = buckets.get(suffix) ?? { count: 0, intents: new Map() };
			row.count += 1;
			row.intents.set(intent, (row.intents.get(intent) ?? 0) + 1);
			buckets.set(suffix, row);
		}
	}

	const routines: MinedRoutine[] = [];
	for (const [pattern, row] of buckets) {
		if (row.count < minCount) continue;
		let bestIntent = "";
		let bestN = 0;
		for (const [intent, n] of row.intents) {
			if (n > bestN) {
				bestN = n;
				bestIntent = intent;
			}
		}
		if (!bestIntent) continue;
		const lenBoost = Math.min(1, pattern.split(">").length / 4);
		routines.push({
			pattern,
			intent: bestIntent,
			count: row.count,
			confidence: Math.min(0.9, (row.count / 6) * 0.5 + lenBoost * 0.35 + (bestN / row.count) * 0.15),
		});
	}

	return routines.sort((a, b) => b.confidence - a.confidence || b.count - a.count);
}

/** 当前轨迹匹配已挖掘 routine，返回候选意图。 */
export function matchRoutinesForTrail(
	trail: string[],
	routines: MinedRoutine[],
): Array<{ intent: string; confidence: number; reason: string }> {
	const tokens = trailTokensFromLive(trail);
	if (tokens.length < 2) return [];

	const out: Array<{ intent: string; confidence: number; reason: string }> = [];
	const seen = new Set<string>();

	for (const routine of routines) {
		const patternTokens = routine.pattern.split(">");
		if (patternTokens.length > tokens.length) continue;
		const suffix = tokens.slice(-patternTokens.length).join(">");
		if (suffix !== routine.pattern) continue;
		const key = routine.intent;
		if (seen.has(key)) continue;
		seen.add(key);
		const overlap = patternTokens.length / Math.max(tokens.length, 1);
		out.push({
			intent: routine.intent,
			confidence: routine.confidence * (0.65 + overlap * 0.35),
			reason: `你曾在类似切换（${routine.count} 次）后执行过`,
		});
	}

	return out.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
