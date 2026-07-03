/**
 * 集成就绪度检查：一条命令看全部渠道 / CLI / 权限是否配好。
 *
 * 用法：
 *   pnpm dotenv -c -- pnpm exec tsx scripts/verify-integrations.ts          # 只探测
 *   pnpm dotenv -c -- pnpm exec tsx scripts/verify-integrations.ts --live   # 额外对已登录渠道跑一条只读真实命令
 */
import {
	isAgentSubagentsEnabled,
	listAvailableAgents,
	loadPluginManifests,
	probeBrowserCdp,
	probeGmailCli,
	probeNango,
	probeOfficeChannels,
	probePlugins,
	probeScreenCapture,
	runOfficeCli,
	runPluginCli,
} from "@fold/connectors";
import { hasPlannerApiKey } from "@fold/ai";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 与 Desktop 一致：把 ~/.fold/config.json 的开关映射进环境，反映 App 真实运行态
try {
	const dataDir = (process.env.FOLD_DATA_DIR ?? join(homedir(), ".fold")).replace(/^~/, homedir());
	const cfg = JSON.parse(readFileSync(join(dataDir, "config.json"), "utf8")) as Record<
		string,
		unknown
	>;
	// 与 applyConfigToEnv 相同语义：config.json 覆盖 .env
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
} catch {
	// 没有 config.json 时按纯 .env 环境探测
}

const live = process.argv.includes("--live");

type Row = { name: string; ok: boolean; warn?: boolean; detail: string; fix?: string };
const rows: Row[] = [];

function icon(row: Row): string {
	return row.ok ? "✅" : row.warn ? "⚠️ " : "❌";
}

async function main() {
	// 1. Planner
	const plannerOk = hasPlannerApiKey();
	rows.push({
		name: "Planner LLM",
		ok: plannerOk,
		detail: plannerOk
			? `provider=${process.env.FOLD_PLANNER_PROVIDER ?? "openai"}`
			: "无 API key，LLM 规划/重规划不可用（仅编译计划）",
		fix: plannerOk ? undefined : "在 .env 或设置里配置 planner provider 的 API key",
	});

	// 2. 本地 Agent
	const agentsEnabled = isAgentSubagentsEnabled();
	const agents = agentsEnabled ? await listAvailableAgents() : [];
	rows.push({
		name: "本地 Agent Subagent",
		ok: agentsEnabled && agents.length > 0,
		warn: !agentsEnabled,
		detail: !agentsEnabled
			? "未启用（plugin.scout / agent 修复不可用）"
			: agents.length
				? `可用: ${agents.join(", ")}`
				: "已启用但未检测到 claude/codex/cursor CLI",
		fix: agentsEnabled && agents.length === 0 ? "安装 claude 或 codex CLI" : undefined,
	});

	// 3. 浏览器
	const cdp = await probeBrowserCdp();
	rows.push({
		name: "Chrome 浏览器",
		ok: cdp.connected,
		detail: cdp.connected
			? `已连接（${(cdp as { mode?: string }).mode === "extension" ? "Playwright Bridge" : "CDP"}）`
			: (cdp.error ?? "未连接"),
		fix: cdp.connected
			? undefined
			: "装 Playwright MCP Bridge 扩展并在设置里填 Token；或 chrome://inspect 开 Allow remote debugging 后重启 Chrome",
	});

	// 4. Gmail CLI
	const gmail = await probeGmailCli();
	rows.push({
		name: "Gmail CLI (gog/gws)",
		ok: gmail.available,
		warn: !gmail.available && !gmail.backend,
		detail: gmail.available
			? `已授权 ${gmail.account ?? ""} (${gmail.backend})`
			: (gmail.error ?? (gmail.backend ? `${gmail.backend} 未授权` : "未安装")),
		fix: gmail.available
			? undefined
			: gmail.backend
				? `运行: ${gmail.backend === "gws" ? "gws auth setup" : "gog auth add <email>"}`
				: "安装 gog（brew install steipete/tap/gog）后 gog auth add",
	});

	// 5. 办公渠道
	for (const ch of await probeOfficeChannels()) {
		rows.push({
			name: `办公渠道 · ${ch.label}`,
			ok: ch.installed && ch.authed,
			warn: !ch.installed,
			detail: !ch.installed
				? "未安装"
				: ch.authed
					? `已登录${ch.detail ? `（${ch.detail}）` : ""}`
					: (ch.error ?? "未登录"),
			fix: ch.installed && !ch.authed ? ch.error : undefined,
		});
	}

	// 6. 插件
	const manifests = loadPluginManifests();
	if (manifests.length === 0) {
		rows.push({
			name: "扩展插件",
			ok: true,
			warn: true,
			detail: "无插件（可用 plugin.scout 或手写 ~/.fold/plugins/*.json 添加）",
		});
	} else {
		for (const p of await probePlugins()) {
			rows.push({
				name: `插件 · ${p.label}`,
				ok: p.installed && p.authed,
				detail: p.installed ? (p.authed ? "就绪" : (p.error ?? "未登录")) : (p.error ?? "未安装"),
			});
		}
	}

	// 7. Nango / 屏幕录制 / 脚本执行
	const nango = await probeNango();
	rows.push({
		name: "Nango 托管授权",
		ok: nango.configured,
		warn: !nango.configured,
		detail: nango.configured
			? `模式=${(nango as { mode?: string }).mode ?? "local"}${nango.gmailConnected ? " · Gmail 已连" : ""}`
			: "未配置（可选，OAuth 托管兜底）",
	});
	const screen = await probeScreenCapture();
	rows.push({
		name: "屏幕录制权限",
		ok: screen.available,
		detail: screen.available ? "已授权" : (screen.error ?? "未授权"),
		fix: screen.available ? undefined : "系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 Fold",
	});
	rows.push({
		name: "脚本执行 (os.shell/python)",
		ok: process.env.FOLD_ALLOW_SCRIPT_EXECUTION === "1",
		detail:
			process.env.FOLD_ALLOW_SCRIPT_EXECUTION === "1" ? "已开启" : "未开启（Settings 里打开）",
	});

	console.log("\n== Fold 集成就绪度 ==\n");
	for (const row of rows) {
		console.log(`${icon(row)} ${row.name} — ${row.detail}`);
		if (!row.ok && row.fix) console.log(`     ↳ ${row.fix}`);
	}
	const ready = rows.filter((r) => r.ok).length;
	console.log(`\n${ready}/${rows.length} 就绪`);

	// --live：对已登录渠道各跑一条只读真实命令
	if (live) {
		console.log("\n== Live 只读验证 ==\n");
		const liveChecks: Array<{ name: string; run: () => Promise<string> }> = [];
		for (const ch of await probeOfficeChannels()) {
			if (!ch.installed || !ch.authed) continue;
			const argsMap: Record<string, string[]> = {
				feishu: ["auth", "whoami"],
				github: ["auth", "status"],
				dingtalk: ["auth", "status", "--format", "json"],
				wecom: ["auth", "show"],
				slack: ["--version"],
			};
			liveChecks.push({
				name: ch.label,
				run: async () => {
					const r = await runOfficeCli(ch.id, argsMap[ch.id] ?? ["--help"], 20_000);
					if (!r.ok) throw new Error(r.stderr || `exit ${r.exitCode}`);
					return (r.stdout || r.stderr).split("\n")[0]?.slice(0, 100) ?? "ok";
				},
			});
		}
		for (const p of await probePlugins()) {
			if (!p.installed || !p.authed) continue;
			liveChecks.push({
				name: `插件 ${p.label}`,
				run: async () => {
					const r = await runPluginCli(p.id, ["--version"], 20_000);
					if (!r.ok) throw new Error(r.stderr || `exit ${r.exitCode}`);
					return (r.stdout || r.stderr).split("\n")[0]?.slice(0, 100) ?? "ok";
				},
			});
		}
		if (liveChecks.length === 0) console.log("（没有已登录的渠道可验证）");
		for (const check of liveChecks) {
			try {
				console.log(`✅ ${check.name} — ${await check.run()}`);
			} catch (e) {
				console.log(`❌ ${check.name} — ${(e as Error).message.slice(0, 120)}`);
			}
		}
	}
}

main()
	.then(() => process.exit(0)) // MCP/Playwright 连接可能留有句柄，显式退出
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
