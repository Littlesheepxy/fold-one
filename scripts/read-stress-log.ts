/**
 * 压测埋点报告：读 SQLite 里已落盘的语音交互 episode + task run 的 phase/approval 事件，
 * 汇总成人看得懂的报告，不需要用户手填表格（对应 docs/agent-stress-checklist.md T1/T2/T4/T5）。
 *
 * 用法：pnpm exec tsx scripts/read-stress-log.ts --since=30m [--data-dir=~/.fold]
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb, listEpisodesInRange, listRunEvents, listTaskRunsInRange, type Episode } from "@fold/memory";

function argValue(flag: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
	return hit?.slice(flag.length + 1);
}

function parseSince(raw: string): number {
	const match = /^(\d+)(m|h)$/.exec(raw.trim());
	if (!match) throw new Error(`--since 格式应为 30m / 2h，收到：${raw}`);
	const n = Number(match[1]);
	return match[2] === "h" ? n * 3_600_000 : n * 60_000;
}

const dataDir = (argValue("--data-dir") ?? join(homedir(), ".fold")).replace(/^~/, homedir());
const sinceArg = argValue("--since") ?? "60m";
const windowMs = parseSince(sinceArg);
const now = Date.now();
const startMs = now - windowMs;

getDb(dataDir); // ensure schema migrated

// docs/agent-stress-checklist.md T1 关注的热词（来自 utterances.json "required" 项 + 此前根因排查用过的例子）。
const KNOWN_KEYWORDS = ["PR", "context", "InputSurface", "ThoughtSurface", "Leo", "十四亿", "ARR", "Fast Path"];

function isVoiceInteraction(ep: Episode): boolean {
	return /^(转写|代回|Agent)：/.test(ep.intent);
}

console.log(`== Fold 压测埋点报告 ==`);
console.log(`dataDir: ${dataDir}`);
console.log(`时间窗: 最近 ${sinceArg}（${new Date(startMs).toLocaleString()} ~ ${new Date(now).toLocaleString()}）\n`);

// ---- T1/T2：语音交互（saveVoiceInteraction 已有的 episode 记录，raw transcript vs 净化后 outcome） ----
const episodes = listEpisodesInRange(startMs, now, dataDir);
const voiceEpisodes = episodes.filter(isVoiceInteraction);

console.log(`---- T1/T2 语音交互（${voiceEpisodes.length} 条） ----`);
if (voiceEpisodes.length === 0) {
	console.log("（窗口内没有语音交互记录，先真机说话测完再跑本脚本）");
} else {
	for (const ep of voiceEpisodes) {
		const transcript = ep.intent.replace(/^(转写|代回|Agent)：/, "");
		console.log(`[${new Date(ep.timestamp).toLocaleTimeString()}] ${ep.status === "failed" ? "❌" : "✅"} ${ep.intent.split("：")[0]}`);
		console.log(`  原始: ${transcript}`);
		if (ep.resultDetail && ep.resultDetail !== transcript) console.log(`  净化后: ${ep.resultDetail}`);
	}
	console.log(`\n热词命中情况（跨窗口内所有语音记录聚合）：`);
	for (const kw of KNOWN_KEYWORDS) {
		const rawHit = voiceEpisodes.some((ep) => ep.intent.includes(kw));
		const outcomeHit = voiceEpisodes.some((ep) => ep.resultDetail?.includes(kw));
		const label = rawHit ? "STT 直接识别对" : outcomeHit ? "STT 错了但净化纠回来了" : "未出现（STT 丢了且没纠回来，或本次没说到）";
		console.log(`  ${kw.padEnd(14)} ${label}`);
	}
}

// ---- T4/T5：task run 的 approval 事件 + phase 时间线 ----
const runs = listTaskRunsInRange(startMs, now, dataDir);
console.log(`\n---- T4/T5 任务运行（${runs.length} 个） ----`);
if (runs.length === 0) {
	console.log("（窗口内没有任务运行记录，先真机跑一个任务/触发一次 HITL 授权再跑本脚本）");
}
for (const run of runs) {
	console.log(`\n[${new Date(run.createdAt).toLocaleTimeString()}] ${run.intent} → ${run.status}${run.error ? ` (${run.error})` : ""}`);
	const events = listRunEvents(run.id, dataDir);

	const phaseEvents = events.filter((e) => e.type === "phase.changed");
	if (phaseEvents.length > 0) {
		console.log(`  phase 时间线:`);
		for (let i = 0; i < phaseEvents.length; i++) {
			const cur = phaseEvents[i]!;
			const payload = cur.payload as { from: string; to: string };
			const nextAt = phaseEvents[i + 1]?.at ?? run.completedAt ?? run.updatedAt;
			const durationMs = nextAt - cur.at;
			const flag = payload.to === "planning" && durationMs > 300 ? "  ⚠️ planning 停留较久" : "";
			console.log(`    ${payload.from} → ${payload.to}  (停留 ${durationMs}ms)${flag}`);
		}
	}

	const approvalEvents = events.filter((e) => e.type === "approval.requested" || e.type === "approval.resolved");
	if (approvalEvents.length > 0) {
		console.log(`  HITL 授权事件:`);
		for (const e of approvalEvents) {
			if (e.type === "approval.requested") {
				const p = e.payload as { title?: string; risk?: string };
				console.log(`    → 弹出授权卡「${p.title}」(risk=${p.risk ?? "none"})`);
			} else {
				const p = e.payload as { choice?: string; latencyMs?: number; error?: string };
				console.log(`    ← 用户选择「${p.choice}」，耗时 ${p.latencyMs}ms${p.error ? ` error=${p.error}` : ""}`);
			}
		}
	}
}

console.log(`\n（注：以上是客观指标——是否触发 HITL、planning 停留多久、STT 热词命中——顺畅度/文案是否说清仍需人肉看一眼 overlay。）`);
