import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { probeBinary } from "../cli/binary.js";
import { runShellDetailed } from "../shell.js";

/**
 * 用户级插件 manifest（~/.fold/plugins/*.json）。
 * 由用户手写或 plugin.scout 子代理自动生成，描述一个外部 CLI 的接入方式。
 */
export interface PluginManifest {
	/** 唯一 id，小写字母数字与连字符 */
	id: string;
	/** 展示名，如 "Notion CLI" */
	label: string;
	/** PATH 上的可执行名（不允许路径分隔符与空格） */
	binary: string;
	/** 安装命令提示，如 "brew install xxx" */
	install?: string;
	/** 登录命令提示，如 "xxx auth login" */
	login?: string;
	/** 退出码为 0 即视为已登录的探测参数，如 ["auth","status"]；缺省时装了就算可用 */
	authCheckArgs?: string[];
	/** 给 planner 的用法说明（1-3 行，含典型 args 示例） */
	catalogDoc?: string;
	/** 单次执行超时（毫秒），默认 60s */
	timeoutMs?: number;
}

export interface PluginProbe {
	id: string;
	label: string;
	binary: string;
	installed: boolean;
	authed: boolean;
	error?: string;
}

export interface PluginCliResult {
	ok: boolean;
	plugin: string;
	stdout: string;
	stderr: string;
	exitCode: number;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function getPluginsDir(): string {
	const dataDir = (process.env.FOLD_DATA_DIR ?? join(homedir(), ".fold")).replace(/^~/, homedir());
	return join(dataDir, "plugins");
}

function parseManifest(raw: string): PluginManifest | null {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!json || typeof json !== "object") return null;
	const m = json as Record<string, unknown>;
	if (typeof m.id !== "string" || !ID_PATTERN.test(m.id)) return null;
	if (typeof m.label !== "string" || !m.label.trim()) return null;
	if (typeof m.binary !== "string" || !/^[\w.-]+$/.test(m.binary)) return null;
	return {
		id: m.id,
		label: m.label,
		binary: m.binary,
		install: typeof m.install === "string" ? m.install : undefined,
		login: typeof m.login === "string" ? m.login : undefined,
		authCheckArgs: Array.isArray(m.authCheckArgs)
			? m.authCheckArgs.map((a) => String(a))
			: undefined,
		catalogDoc: typeof m.catalogDoc === "string" ? m.catalogDoc : undefined,
		timeoutMs: typeof m.timeoutMs === "number" ? m.timeoutMs : undefined,
	};
}

/** 读取全部插件 manifest；坏文件跳过不报错。 */
export function loadPluginManifests(): PluginManifest[] {
	const dir = getPluginsDir();
	if (!existsSync(dir)) return [];
	const manifests: PluginManifest[] = [];
	const seen = new Set<string>();
	for (const file of readdirSync(dir)) {
		if (!file.endsWith(".json")) continue;
		try {
			const manifest = parseManifest(readFileSync(join(dir, file), "utf8"));
			if (manifest && !seen.has(manifest.id)) {
				seen.add(manifest.id);
				manifests.push(manifest);
			}
		} catch {
			// 单个坏文件不影响其他插件
		}
	}
	return manifests;
}

async function probePlugin(manifest: PluginManifest): Promise<PluginProbe> {
	const base = { id: manifest.id, label: manifest.label, binary: manifest.binary };
	const installed = await probeBinary(manifest.binary);
	if (!installed) {
		return {
			...base,
			installed: false,
			authed: false,
			error: `${manifest.binary} 未安装${manifest.install ? `。运行: ${manifest.install}` : ""}`,
		};
	}
	if (!manifest.authCheckArgs?.length) {
		return { ...base, installed: true, authed: true };
	}
	const check = await runShellDetailed(manifest.binary, manifest.authCheckArgs, 8000);
	if (check.exitCode === 0) return { ...base, installed: true, authed: true };
	return {
		...base,
		installed: true,
		authed: false,
		error: `${manifest.binary} 未登录${manifest.login ? `。运行: ${manifest.login}` : ""}`,
	};
}

/** 并行探测全部插件的安装/登录态。 */
export async function probePlugins(): Promise<PluginProbe[]> {
	return Promise.all(loadPluginManifests().map(probePlugin));
}

/** 以 execFile 模式运行插件 CLI（无 shell / 管道）。 */
export async function runPluginCli(
	pluginId: string,
	args: string[],
	timeoutMs?: number,
): Promise<PluginCliResult> {
	const manifest = loadPluginManifests().find((m) => m.id === pluginId);
	if (!manifest) throw new Error(`未知插件: ${pluginId}（~/.fold/plugins/ 下没有对应 manifest）`);
	const result = await runShellDetailed(
		manifest.binary,
		args,
		timeoutMs ?? manifest.timeoutMs ?? 60_000,
	);
	return {
		ok: result.exitCode === 0,
		plugin: manifest.id,
		stdout: result.stdout.trim().slice(0, 8000),
		stderr: result.stderr.trim().slice(0, 2000),
		exitCode: result.exitCode,
	};
}
