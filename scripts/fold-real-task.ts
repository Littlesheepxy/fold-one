/**
 * 真实场景驱动：把用户原话喂给 Fold runTask，观察 Fold 自主执行全过程。
 * 用法：pnpm dotenv -c -- pnpm exec tsx scripts/fold-real-task.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ContextStore } from "@fold/context";
import { runTask, type StateEmitter } from "@fold/runtime";

// 与 Desktop 一致：config.json 覆盖 .env
try {
	const cfg = JSON.parse(readFileSync(join(homedir(), ".fold", "config.json"), "utf8")) as Record<
		string,
		unknown
	>;
	if (typeof cfg.allowAgentSubagents === "boolean")
		process.env.FOLD_ALLOW_AGENT_SUBAGENTS = cfg.allowAgentSubagents ? "1" : "0";
	if (typeof cfg.allowScriptExecution === "boolean")
		process.env.FOLD_ALLOW_SCRIPT_EXECUTION = cfg.allowScriptExecution ? "1" : "0";
	if (typeof cfg.playwrightMcpExtensionToken === "string")
		process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN = cfg.playwrightMcpExtensionToken;
	if (typeof cfg.nangoSecretKey === "string")
		process.env.FOLD_NANGO_SECRET_KEY = cfg.nangoSecretKey;
	if (typeof cfg.hubApiKey === "string") process.env.FOLD_HUB_API_KEY = cfg.hubApiKey;
	if (typeof cfg.chromeCdpUrl === "string") process.env.FOLD_CHROME_CDP_URL = cfg.chromeCdpUrl;
	if (typeof cfg.plannerProvider === "string")
		process.env.FOLD_PLANNER_PROVIDER = cfg.plannerProvider;
	if (typeof cfg.plannerApiKey === "string") process.env.FOLD_PLANNER_API_KEY = cfg.plannerApiKey;
	if (typeof cfg.plannerModel === "string") process.env.FOLD_PLANNER_MODEL = cfg.plannerModel;
	if (typeof cfg.fastProvider === "string") process.env.FOLD_FAST_PROVIDER = cfg.fastProvider;
	if (typeof cfg.fastModel === "string") process.env.FOLD_FAST_MODEL = cfg.fastModel;
} catch {}

const intentArg = process.argv.find((arg) => arg.startsWith("--intent="));
const INTENT =
	intentArg?.slice("--intent=".length).trim() ||
	process.env.FOLD_REAL_TASK_INTENT?.trim() ||
	"看一下 Chrome 里的百度页面，把页面里每一条链接都抓取下来，新建一个飞书多维表格并写进去";

const emit: StateEmitter = (e) => {
	const ts = new Date().toISOString().slice(11, 19);
	const parts = [`[${ts}] status=${e.status}`];
	if (e.progressMessage) parts.push(`progress=${e.progressMessage}`);
	if (e.result) parts.push(`result=${e.result}`);
	if (e.error) parts.push(`error=${e.error}`);
	console.log(parts.join(" | "));
	if (e.thinkingText) console.log("  [thinking]\n" + e.thinkingText.split("\n").map((l) => "    " + l).join("\n"));
	if (e.steps?.length)
		console.log("  [steps] " + e.steps.map((s) => `${s.label}:${s.status}`).join(" · "));
};

async function main() {
	const store = new ContextStore();
	const result = await runTask(INTENT, emit, {
		getLiveContext: () => store.get(),
	});
	console.log("\n========== FINAL ==========");
	console.log("status:", result.status);
	console.log("error:", result.error ?? "(none)");
	for (const s of result.steps) {
		console.log(`step ${s.stepId} [${s.skill}] ${s.status} ${s.durationMs}ms ${s.error ?? ""}`);
		if (s.output) {
			const out = JSON.stringify(s.output);
			console.log("  output:", out.length > 600 ? out.slice(0, 600) + "…" : out);
		}
	}
	process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
