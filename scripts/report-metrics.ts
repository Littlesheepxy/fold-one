/**
 * 本地产品指标周报（读 product_events + episodes）。
 *
 * 用法：
 *   ELECTRON_RUN_AS_NODE=1 path/to/Electron ./node_modules/tsx/dist/cli.mjs scripts/report-metrics.ts
 *   # 或先 rebuild better-sqlite3 给当前 Node 后再：
 *   pnpm exec tsx scripts/report-metrics.ts
 */
import { listEpisodeSummaries, listProductEvents } from "@fold/memory";

const DAY = 86_400_000;
const now = Date.now();
const weekAgo = now - 7 * DAY;
const dayAgo = now - DAY;

function count(name: string, since: number): number {
	return listProductEvents({ name, since, limit: 2000 }).length;
}

function main() {
	const inserted = count("reply_draft_inserted", weekAgo);
	const rejected = count("reply_draft_rejected", weekAgo);
	const dismissed = count("reply_draft_dismissed", weekAgo);
	const undone = count("reply_draft_undone", weekAgo);
	const shownish = inserted + rejected + dismissed; // 粗估曝光后动作
	const adoptRate = shownish ? ((inserted / shownish) * 100).toFixed(1) : "n/a";
	const rejectRate = shownish ? ((rejected / shownish) * 100).toFixed(1) : "n/a";

	const episodes = listEpisodeSummaries(500);
	const weekEps = episodes.filter((e) => e.timestamp >= weekAgo);
	const dayEps = episodes.filter((e) => e.timestamp >= dayAgo);
	const success = weekEps.filter((e) => e.status === "success").length;
	const failed = weekEps.filter((e) => e.status === "failed").length;
	const taskTotal = success + failed;
	const taskRate = taskTotal ? ((success / taskTotal) * 100).toFixed(1) : "n/a";

	const firstReply = listProductEvents({ name: "first_real_reply_success", limit: 1 })[0];
	const weeklyShown = count("weekly_recap_shown", weekAgo);

	console.log("=== Fold metrics (last 7d) ===");
	console.log(`reply insert / reject / dismiss / undo: ${inserted} / ${rejected} / ${dismissed} / ${undone}`);
	console.log(`adopt rate (insert/(insert+reject+dismiss)): ${adoptRate}%`);
	console.log(`reject rate: ${rejectRate}%`);
	console.log(`episodes success/fail: ${success}/${failed} (success rate ${taskRate}%)`);
	console.log(`active tasks D1 (episodes last 24h): ${dayEps.length}`);
	console.log(`active tasks D7: ${weekEps.length}`);
	console.log(
		`first_real_reply_success: ${firstReply ? new Date(firstReply.at).toISOString() : "never"}`,
	);
	console.log(`weekly_recap_shown (7d): ${weeklyShown}`);
}

main();
