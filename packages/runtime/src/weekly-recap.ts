import {
	listActiveMemories,
	listProductEvents,
	saveProductEvent,
	upsertMemory,
} from "@fold/memory";

const META_WEEKLY_SHOWN = "weekly.recap.shown";

export interface WeeklyRecap {
	weekKey: string;
	title: string;
	body: string;
	inserted: number;
	openCommitments: string[];
}

/** ISO 周键：2026-W29 */
export function currentWeekKey(now = Date.now()): string {
	const d = new Date(now);
	// UTC Thursday trick for ISO week
	const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
	const day = tmp.getUTCDay() || 7;
	tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekStartMs(weekKey: string): number {
	const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
	if (!m) return Date.now() - 7 * 86_400_000;
	const year = Number(m[1]);
	const week = Number(m[2]);
	// ISO: week 1 contains Jan 4
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const day = jan4.getUTCDay() || 7;
	const monday = new Date(jan4);
	monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
	return monday.getTime();
}

function lastShownWeek(dataDir?: string): string | null {
	const row = listActiveMemories("meta", dataDir).find((m) => m.key === META_WEEKLY_SHOWN);
	return row?.value ?? null;
}

export function shouldShowWeeklyRecap(now = Date.now(), dataDir?: string): boolean {
	const key = currentWeekKey(now);
	if (lastShownWeek(dataDir) === key) return false;
	// 周一到周五、且本周已有至少一次代回插入，才弹（避免空周打扰）
	const dow = new Date(now).getDay(); // 0 Sun
	if (dow === 0 || dow === 6) return false;
	const since = weekStartMs(key);
	return listProductEvents({ name: "reply_draft_inserted", since, limit: 1 }, dataDir).length > 0;
}

export function buildWeeklyRecap(now = Date.now(), dataDir?: string): WeeklyRecap {
	const weekKey = currentWeekKey(now);
	const since = weekStartMs(weekKey);
	const inserted = listProductEvents(
		{ name: "reply_draft_inserted", since, limit: 2000 },
		dataDir,
	).length;
	const rejected = listProductEvents(
		{ name: "reply_draft_rejected", since, limit: 2000 },
		dataDir,
	).length;
	const minutes = Math.max(1, Math.round(inserted * 1.8)); // ponytail: 粗估，升级路径=真实耗时埋点

	const people = listActiveMemories("entity.person", dataDir);
	const openCommitments: string[] = [];
	const personHits: Array<{ name: string; at: number }> = [];
	for (const p of people) {
		try {
			const v = JSON.parse(p.value) as {
				name?: string;
				commitment?: string;
				lastSeenDate?: string;
			};
			if (v.commitment?.trim()) {
				openCommitments.push(`${v.name ?? p.key}：${v.commitment.trim()}`);
			}
			if (v.name) personHits.push({ name: v.name, at: p.updatedAt });
		} catch {
			/* skip */
		}
	}
	personHits.sort((a, b) => b.at - a.at);
	const topPeople = personHits.slice(0, 3).map((p) => p.name);

	const lines: string[] = [];
	lines.push(
		inserted
			? `本周帮你插入了 ${inserted} 条回复（约省 ${minutes} 分钟）${rejected ? `，你明确拒绝了 ${rejected} 条` : ""}。`
			: "本周还没有代回记录。",
	);
	if (topPeople.length) {
		lines.push(`最近常联系：${topPeople.join("、")}。`);
	}
	if (openCommitments.length) {
		lines.push(`还有未兑现的承诺：${openCommitments.slice(0, 3).join("；")}。`);
	} else {
		lines.push("暂无未兑现承诺。");
	}

	return {
		weekKey,
		title: "本周知更回顾",
		body: lines.join("\n"),
		inserted,
		openCommitments,
	};
}

export function markWeeklyRecapShown(weekKey: string, dataDir?: string): void {
	upsertMemory(
		{ type: "meta", key: META_WEEKLY_SHOWN, value: weekKey, confidence: 1 },
		dataDir,
	);
	saveProductEvent({ name: "weekly_recap_shown", props: { weekKey } }, dataDir);
}

/** ponytail: 周键 + 空数据不崩 */
export function runWeeklyRecapSelfCheck(): void {
	const key = currentWeekKey(Date.parse("2026-07-16T12:00:00+08:00"));
	console.assert(/^2026-W\d{2}$/.test(key), "week key shape");
	const recap = buildWeeklyRecap(Date.now(), undefined);
	console.assert(recap.title.includes("回顾"), "title");
	console.assert(typeof recap.body === "string", "body");
}
