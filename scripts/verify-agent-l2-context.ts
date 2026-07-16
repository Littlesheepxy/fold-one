/**
 * 验证 Agent Planner L2 摘要拼装（不依赖真机 AX）。
 * 用法：pnpm exec tsx scripts/verify-agent-l2-context.ts
 */
import {
	formatEnrichedPlannerSummary,
	runAgentPlannerContextSelfCheck,
	type EnrichedContext,
} from "../packages/runtime/src/context-enrich.ts";

runAgentPlannerContextSelfCheck();

const enriched: EnrichedContext = {
	enrichment: {
		accessibilityText: "Jason：周五前把 BP 发我",
		accessibilityApp: "飞书",
		accessibilityWindowTitle: "投资讨论",
		calendarEvents: [
			{
				title: "投资例会",
				startAt: Date.now() + 40 * 60_000,
				endAt: Date.now() + 100 * 60_000,
			},
		],
	},
	summary: "Active: 飞书",
	brief: "Active app: 飞书\nWindow: 投资讨论\n\n接下来日程：\n  - 40分钟后 · 投资例会",
	screenSnippet: "Jason：周五前把 BP 发我",
	confidence: { level: "high", score: 0.78, reasons: ["ax"] },
};

const summary = formatEnrichedPlannerSummary(enriched);
const checks = [
	["brief", summary.includes("飞书")],
	["ax", summary.includes("Jason")],
	["confidence", summary.includes("Context confidence: high")],
	["pct", summary.includes("78%")],
] as const;

let failed = 0;
for (const [name, ok] of checks) {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
	if (!ok) failed += 1;
}

console.log(failed === 0 ? "\nAgent L2 context OK" : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
