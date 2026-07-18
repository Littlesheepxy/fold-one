import { homedir } from "node:os";
import { join } from "node:path";
import {
	classifyTaskClass,
	getDb,
	listAllRecipes,
	listRecentEpisodes,
} from "@fold/memory";

function argValue(flag: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
	return hit?.slice(flag.length + 1);
}

const dataDir = argValue("--data-dir") ?? join(homedir(), ".fold");
getDb(dataDir); // migrate

const episodes = listRecentEpisodes(500, dataDir);
const byClass = new Map<string, number>();
for (const ep of episodes) {
	const skills = (() => {
		try {
			return (JSON.parse(ep.stepsJson ?? "[]") as Array<{ skill?: string }>)
				.map((s) => s.skill)
				.filter((s): s is string => Boolean(s));
		} catch {
			return [] as string[];
		}
	})();
	// Old rows predate task_class column — classify on the fly for Zipf.
	const key = ep.taskClass ?? classifyTaskClass(ep.intent, skills);
	byClass.set(key, (byClass.get(key) ?? 0) + 1);
}
const ranked = [...byClass.entries()].sort((a, b) => b[1] - a[1]);
const total = episodes.length || 1;

console.log(`== Fold recipe stats ==`);
console.log(`dataDir: ${dataDir}`);
console.log(`episodes (last ${episodes.length}):`);
console.log(`rank  count  cum%    task_class`);
let cum = 0;
ranked.forEach(([cls, n], i) => {
	cum += n;
	console.log(
		`${String(i + 1).padStart(4)}  ${String(n).padStart(5)}  ${((cum / total) * 100).toFixed(1).padStart(5)}%  ${cls}`,
	);
});

const recipes = listAllRecipes(dataDir);
const active = recipes.filter((r) => r.status === "active");
const demoted = recipes.filter((r) => r.status === "demoted");
console.log(`\nrecipes: ${recipes.length} total, ${active.length} active, ${demoted.length} demoted`);
const covered = new Set(active.map((r) => r.taskClass));
const topMissing = ranked.filter(([cls]) => !covered.has(cls)).slice(0, 10);
console.log(`top task_class without active recipe:`);
for (const [cls, n] of topMissing) {
	console.log(`  ${n}× ${cls}`);
}
if (topMissing.length === 0) console.log(`  (none in top set)`);
