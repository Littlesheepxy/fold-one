import {
	executeAgent,
	getPluginsDir,
	loadPluginManifests,
	probePlugins,
	runPluginCli,
} from "@fold/connectors";
import type { SkillContext } from "../types.js";

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item));
}

/** 运行用户安装的插件 CLI（manifest 来自 ~/.fold/plugins/*.json）。 */
export async function pluginCli(args: Record<string, unknown>, ctx: SkillContext) {
	const plugin = String(args.plugin ?? "");
	if (!plugin) throw new Error("plugin.cli: plugin required");
	const cliArgs = stringArray(args.args);

	ctx.emit({ type: "progress", message: `运行插件 ${plugin}` });
	return runPluginCli(plugin, cliArgs);
}

const MANIFEST_SCHEMA_DOC = `{
  "id": "notion",                        // 必填，小写字母数字连字符
  "label": "Notion CLI",                 // 必填，展示名
  "binary": "notion",                    // 必填，PATH 上的可执行名（不含路径/空格）
  "install": "npm install -g @notionhq/cli",   // 可选，安装命令
  "login": "notion auth login",          // 可选，登录命令
  "authCheckArgs": ["auth", "status"],   // 可选，退出码 0 = 已登录
  "catalogDoc": "notion: pages/databases CRUD. e.g. args [\\"page\\",\\"create\\",\\"--title\\",\\"x\\"]",  // 可选，给 planner 的用法说明
  "timeoutMs": 60000                     // 可选
}`;

/**
 * Integration Scout：让本地 Agent 子代理联网调研某个服务的官方/主流 CLI 接入方式，
 * 生成插件 manifest 写入 ~/.fold/plugins/，之后 plugin.cli 即可复用。
 */
export async function pluginScout(args: Record<string, unknown>, ctx: SkillContext) {
	const service = String(args.service ?? "").trim();
	if (!service) throw new Error("plugin.scout: service required");
	const hint = typeof args.hint === "string" ? args.hint : "";
	const pluginsDir = getPluginsDir();
	const existing = loadPluginManifests().map((m) => m.id);

	ctx.emit({ type: "progress", message: `正在调研 ${service} 的 CLI 接入方式` });

	const brief = [
		`Research how to integrate the service "${service}" as a CLI plugin for Fold (a macOS automation agent).`,
		hint ? `User hint: ${hint}` : "",
		"",
		"Steps:",
		"1. Find the official CLI for this service, or the best-maintained community CLI (search the web if you can).",
		"2. Check whether the binary is already installed locally (try `<binary> --version`). Do NOT install anything.",
		"3. Figure out: install command, login command, and an auth-status check whose exit code 0 means logged in.",
		`4. Write a manifest JSON file to ${pluginsDir}/<id>.json (create the directory if missing) with this schema:`,
		MANIFEST_SCHEMA_DOC,
		"5. In catalogDoc, include 1-2 concrete args examples for the most useful read and write operations.",
		existing.length ? `Existing plugin ids (do not reuse): ${existing.join(", ")}` : "",
		"",
		"Finally print exactly one line: PLUGIN_ID=<the id you used>",
	]
		.filter(Boolean)
		.join("\n");

	const result = await executeAgent({
		brief,
		contextSnapshot: "",
		agent: "auto",
		maxTurns: 20,
		timeoutMs: 300_000,
		allowEdits: true,
		signal: ctx.signal,
	});
	if (!result.ok) {
		throw new Error(result.summary || result.stderr || "插件调研 Agent 执行失败");
	}

	const pluginId = `${result.summary}\n${result.stderr ?? ""}`.match(/PLUGIN_ID=([a-z0-9-]+)/)?.[1];
	const manifests = loadPluginManifests();
	const manifest = pluginId
		? manifests.find((m) => m.id === pluginId)
		: manifests.find((m) => !existing.includes(m.id));
	if (!manifest) {
		throw new Error(`Agent 完成但没有在 ${pluginsDir} 生成有效的插件 manifest`);
	}

	const probe = (await probePlugins()).find((p) => p.id === manifest.id);
	return {
		ok: true,
		pluginId: manifest.id,
		label: manifest.label,
		binary: manifest.binary,
		installed: probe?.installed ?? false,
		authed: probe?.authed ?? false,
		install: manifest.install,
		login: manifest.login,
	};
}
