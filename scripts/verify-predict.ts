/**
 * 验证情境预测：读 live context + Chrome 标签 + episode 相似 / routine 挖掘。
 * 用法：pnpm exec tsx scripts/verify-predict.ts
 */
import { listChromeTabsViaAppleScript } from "@fold/connectors";
import { createEmptyContext } from "@fold/context";
import {
	buildPredictions,
	buildSituationFingerprint,
	extractEntityTokens,
	mineRoutinesFromEpisodes,
	resolveInformationObjects,
	retrieveSimilarTraces,
} from "@fold/runtime";
import { readFrontWindowAccessibilityText } from "@fold/connectors";

async function main() {
	const chromeTabs = await listChromeTabsViaAppleScript().catch(() => []);
	const ax = await readFrontWindowAccessibilityText().catch(() => null);
	const ctx = createEmptyContext();
	ctx.activeApp = "Google Chrome";
	ctx.activeWindow = chromeTabs.find((t) => t.active)?.title ?? chromeTabs[0]?.title ?? null;
	if (chromeTabs[0]) {
		ctx.recentUrls = chromeTabs.slice(0, 5).map((t) => ({
			url: t.url,
			title: t.title,
			timestamp: Date.now(),
		}));
	}

	const enrichment = {
		chromeTabs,
		accessibilityText: ax?.text,
		entities: extractEntityTokens(ax?.text),
	};
	const objects = resolveInformationObjects(ctx, enrichment);
	const fp = buildSituationFingerprint(ctx, enrichment);
	const routines = mineRoutinesFromEpisodes();
	const result = buildPredictions(ctx, undefined, enrichment);
	const traces = retrieveSimilarTraces(ctx, undefined, 2, enrichment);

	console.log("\n--- AX snippet ---");
	console.log(ax?.text?.slice(0, 200) ?? "(none)");
	console.log("\n--- Entities ---");
	console.log(enrichment.entities.join(", ") || "(none)");

	console.log("--- Information Objects ---");
	for (const o of objects.slice(0, 6)) {
		console.log(`  [${o.kind}] ${o.title} (${o.id})`);
	}
	console.log("\n--- Fingerprint ---");
	console.log(JSON.stringify(fp, null, 2));
	console.log("\n--- Mined Routines (top 5) ---");
	for (const r of routines.slice(0, 5)) {
		console.log(`  ${r.pattern} ×${r.count} → ${r.intent.slice(0, 50)}…`);
	}
	console.log("\n--- Predictions ---");
	console.log(`mode: ${result.mode}`);
	console.log(`anchor: ${result.anchor ?? "—"}`);
	for (const s of result.suggestions) {
		console.log(`  [${(s.confidence * 100).toFixed(0)}%] ${s.label}`);
		console.log(`       ${s.reason}`);
	}
	if (traces.length) {
		console.log("\n--- Similar Traces ---");
		for (const t of traces) {
			console.log(`  [${(t.score * 100).toFixed(0)}%] ${t.intent.slice(0, 50)}`);
			if (t.planSteps.length) console.log(`       steps: ${t.planSteps.join(" → ")}`);
		}
	}
	if (result.suggestions.length === 0) {
		console.log("  (无推荐 — 需要更多成功任务记录)");
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
