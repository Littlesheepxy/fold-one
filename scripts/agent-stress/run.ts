/**
 * Fold Agent headless stress suite (no voice).
 *
 * Usage:
 *   pnpm test:agent-stress
 *   pnpm test:agent-stress -- --scenario=history
 *   pnpm test:agent-stress -- --repeat=3
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { journeyScenarios } from "./journeys.ts";
import { scenarios as baseScenarios } from "./scenarios.ts";
import { allPass, type Scenario, type TurnResult } from "./types.ts";

const scenarios: Scenario[] = [...baseScenarios, ...journeyScenarios];

function argValue(flag: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
	return hit?.slice(flag.length + 1);
}

function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

async function runOne(scenario: Scenario, reportDir: string): Promise<{
	ok: boolean;
	turns: TurnResult[];
	error?: string;
}> {
	const dataDir = mkdtempSync(join(tmpdir(), `fold-stress-${scenario.id}-data-`));
	const homeDir = mkdtempSync(join(tmpdir(), `fold-stress-${scenario.id}-home-`));
	mkdirSync(join(homeDir, "Downloads"), { recursive: true });

	const lines: string[] = [];
	const log = (line: string) => {
		lines.push(line);
		console.log(`  ${line}`);
	};

	try {
		const turns = await scenario.run({ dataDir, homeDir, reportDir, log });
		const ok = turns.every(
			(t) => t.skipped || allPass(t.checks),
		);
		writeFileSync(
			join(reportDir, `${scenario.id}.json`),
			JSON.stringify({ id: scenario.id, name: scenario.name, dataDir, homeDir, turns }, null, 2),
		);
		return { ok, turns };
	} catch (e) {
		const error = (e as Error).stack ?? String(e);
		writeFileSync(join(reportDir, `${scenario.id}.error.txt`), error);
		return { ok: false, turns: [], error };
	}
}

async function main() {
	const only = argValue("--scenario");
	const repeat = Math.max(1, Number(argValue("--repeat") ?? "1") || 1);
	const selected = only
		? scenarios.filter((s) => s.id === only)
		: scenarios;

	if (only && selected.length === 0) {
		console.error(`Unknown scenario: ${only}`);
		console.error(`Available: ${scenarios.map((s) => s.id).join(", ")}`);
		process.exit(2);
	}

	const reportDir = mkdtempSync(join(tmpdir(), "fold-agent-stress-"));
	console.log(`== Fold agent stress ==`);
	console.log(`report: ${reportDir}`);
	console.log(`scenarios: ${selected.map((s) => s.id).join(", ")}`);
	console.log(`repeat: ${repeat}`);

	let failed = 0;
	let skipped = 0;
	let passed = 0;

	for (let i = 1; i <= repeat; i++) {
		if (repeat > 1) console.log(`\n--- repeat ${i}/${repeat} ---`);
		for (const scenario of selected) {
			console.log(`\n▶ ${scenario.id} — ${scenario.name}`);
			const result = await runOne(scenario, reportDir);
			if (result.error) {
				failed += 1;
				console.log(`  FAIL  crashed: ${result.error.split("\n")[0]}`);
				continue;
			}
			for (const turn of result.turns) {
				if (turn.skipped) {
					skipped += 1;
					console.log(`  SKIP  ${turn.label}: ${turn.skipped}`);
					continue;
				}
				for (const c of turn.checks) {
					const mark = c.pass ? "PASS" : "FAIL";
					if (!c.pass) failed += 1;
					else passed += 1;
					console.log(
						`  ${mark}  [${turn.label}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`,
					);
				}
			}
			if (!result.ok) {
				// checks already counted; mark scenario failed once more only if no check failures yet
				const checkFails = result.turns.flatMap((t) => t.checks).filter((c) => !c.pass).length;
				if (checkFails === 0) failed += 1;
			}
		}
	}

	const md = [
		`# Fold agent stress report`,
		``,
		`- time: ${new Date().toISOString()}`,
		`- scenarios: ${selected.map((s) => s.id).join(", ")}`,
		`- repeat: ${repeat}`,
		`- checks pass: ${passed}`,
		`- checks fail: ${failed}`,
		`- skipped turns: ${skipped}`,
		``,
		`Artifacts: \`${reportDir}\``,
		``,
	].join("\n");
	writeFileSync(join(reportDir, "report.md"), md);
	console.log(`\n== summary ==`);
	console.log(md);

	if (failed > 0 || hasFlag("--strict-skip") && skipped > 0) {
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
