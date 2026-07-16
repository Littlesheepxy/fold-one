import { listRecentEpisodes, loadProfileMemories, saveProfileMemories } from "@fold/memory";

const RECALL_INTERVAL_MS = 30 * 60 * 1000;

/** 从近期 episode（含转写 / 代回 / Agent）归纳工作习惯，写入 profile。 */
export function recallHabitsFromUsage(dataDir?: string): void {
	const episodes = listRecentEpisodes(80, dataDir);
	if (!episodes.length) return;

	const existing = loadProfileMemories(dataDir) ?? {};
	const patterns = new Set(existing.workPatterns ?? []);

	let structure = 0;
	let reply = 0;
	let agent = 0;
	const appCounts = new Map<string, number>();

	for (const ep of episodes) {
		const intent = ep.intent.trim();
		if (intent.startsWith("转写：")) structure += 1;
		else if (intent.startsWith("代回：")) reply += 1;
		else agent += 1;

		try {
			const summary = ep.summaryJson ? (JSON.parse(ep.summaryJson) as { apps?: string[] }) : null;
			for (const app of summary?.apps ?? []) {
				if (!app) continue;
				appCounts.set(app, (appCounts.get(app) ?? 0) + 1);
			}
		} catch {
			// ignore
		}
	}

	if (structure >= 2) patterns.add("常用语音转写整理口述");
	if (reply >= 2) patterns.add("常用代回生成聊天回复");
	if (agent >= 3) patterns.add("常用语音驱动 Agent 执行任务");

	const topApp = [...appCounts.entries()].sort((a, b) => b[1] - a[1])[0];
	if (topApp && topApp[1] >= 3) {
		patterns.add(`常在 ${topApp[0]} 中使用 Fold`);
	}

	if (patterns.size === (existing.workPatterns ?? []).length && structure + reply + agent === 0) {
		return;
	}

	saveProfileMemories(
		{
			...existing,
			workPatterns: [...patterns].slice(0, 12),
			updatedAt: Date.now(),
		},
		"habit-recall",
		dataDir,
	);
}

export function startHabitRecallLoop(
	tick: () => void,
	intervalMs = RECALL_INTERVAL_MS,
): () => void {
	tick();
	const timer = setInterval(tick, intervalMs);
	return () => clearInterval(timer);
}
