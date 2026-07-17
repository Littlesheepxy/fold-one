import { extractJsonPayload, probeBinary } from "../cli/binary.js";
import { probeLarkCli } from "../feishu/index.js";
import { runShellDetailed } from "../shell.js";
import { probeSlackCli } from "../slack/index.js";
import { openInTerminal } from "../terminal.js";

export type OfficeChannelId = "feishu" | "github" | "dingtalk" | "wecom" | "slack";

export interface OfficeChannelProbe {
	id: OfficeChannelId;
	label: string;
	binary: string;
	installed: boolean;
	authed: boolean;
	detail?: string;
	error?: string;
}

export interface OfficeCliResult {
	ok: boolean;
	channel: OfficeChannelId;
	stdout: string;
	stderr: string;
	exitCode: number;
}

interface OfficeChannelSpec {
	id: OfficeChannelId;
	label: string;
	binary: string;
	/** Command run in Terminal to install the CLI; falls back to installUrl when absent. */
	installCommand?: string;
	installUrl?: string;
	loginCommand: string;
	probeAuth: () => Promise<{ authed: boolean; detail?: string; error?: string }>;
}

const CHANNELS: OfficeChannelSpec[] = [
	{
		id: "feishu",
		label: "飞书 (lark-cli)",
		binary: "lark-cli",
		installCommand: "npm install -g @larksuite/cli",
		loginCommand: "lark-cli auth login",
		probeAuth: async () => {
			const probe = await probeLarkCli();
			return {
				authed: probe.authed,
				detail: probe.identity ? `身份：${probe.identity}` : undefined,
				error: probe.error,
			};
		},
	},
	{
		id: "github",
		label: "GitHub (gh)",
		binary: "gh",
		installCommand: "brew install gh",
		loginCommand: "gh auth login",
		probeAuth: async () => {
			const status = await runShellDetailed("gh", ["auth", "status"], 8000);
			if (status.exitCode !== 0) {
				return { authed: false, error: "gh 未登录。运行: gh auth login" };
			}
			const account = (status.stdout + status.stderr).match(/account (\S+)/)?.[1];
			return { authed: true, detail: account ? `账号：${account}` : undefined };
		},
	},
	{
		id: "dingtalk",
		label: "钉钉 (dws)",
		binary: "dws",
		installCommand: "npm install -g dingtalk-workspace-cli",
		loginCommand: "dws auth login",
		probeAuth: async () => {
			const status = await runShellDetailed("dws", ["auth", "status", "--format", "json"], 8000);
			const payload = extractJsonPayload(status.stdout) as {
				authenticated?: boolean;
				message?: string;
			} | null;
			if (payload?.authenticated) return { authed: true };
			return { authed: false, error: payload?.message ?? "dws 未登录。运行: dws auth login" };
		},
	},
	{
		id: "wecom",
		label: "企业微信 (wecom-cli)",
		binary: "wecom-cli",
		installCommand: "npm install -g @wecom/cli",
		loginCommand: "wecom-cli init",
		probeAuth: async () => {
			const status = await runShellDetailed("wecom-cli", ["auth", "show"], 8000);
			const text = (status.stdout + status.stderr).trim();
			if (status.exitCode !== 0 || /unauthorized/i.test(text)) {
				return { authed: false, error: "wecom-cli 未授权。运行: wecom-cli init" };
			}
			return { authed: true, detail: text.slice(0, 120) || undefined };
		},
	},
	{
		id: "slack",
		label: "Slack",
		binary: "slack-cli",
		installUrl: "https://github.com/rockymadden/slack-cli",
		loginCommand: "slack-cli init",
		probeAuth: async () => {
			const probe = await probeSlackCli();
			if (!probe.available) return { authed: false, error: probe.error };
			if (probe.error) return { authed: false, error: probe.error };
			return { authed: true, detail: probe.backend ? `后端：${probe.backend}` : undefined };
		},
	},
];

const CHANNEL_BINARIES: Record<OfficeChannelId, string> = Object.fromEntries(
	CHANNELS.map((c) => [c.id, c.binary]),
) as Record<OfficeChannelId, string>;

function parseParamsJson(raw: string): Record<string, string> | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
				key,
				String(value),
			]),
		);
	} catch {
		return null;
	}
}

/**
 * lark-cli generic `api` 不读取 path 内的 query string，只接受 `--params` JSON。
 * Planner/旧计划可能生成 `...?x=y` 或 `--query`; 在连接器边界统一归一化。
 */
export function normalizeOfficeCliArgs(channelId: string, args: string[]): string[] {
	const normalized = [...args];
	if (channelId !== "feishu" || normalized[0] !== "api") return normalized;

	for (let i = 0; i < normalized.length; i += 1) {
		if (normalized[i] === "--query") normalized[i] = "--params";
	}

	const pathIndex = 2;
	const path = normalized[pathIndex];
	if (!path?.includes("?")) return normalized;

	const queryIndex = path.indexOf("?");
	normalized[pathIndex] = path.slice(0, queryIndex);
	const fromPath = Object.fromEntries(new URLSearchParams(path.slice(queryIndex + 1)));
	if (Object.keys(fromPath).length === 0) return normalized;

	const paramsFlag = normalized.indexOf("--params");
	if (paramsFlag < 0) {
		normalized.push("--params", JSON.stringify(fromPath));
		return normalized;
	}

	const existing = normalized[paramsFlag + 1];
	const parsed = existing ? parseParamsJson(existing) : null;
	if (parsed) {
		// 显式 --params 优先于 path 中的同名值。
		normalized[paramsFlag + 1] = JSON.stringify({ ...fromPath, ...parsed });
	}
	return normalized;
}

function getChannel(id: string): OfficeChannelSpec {
	const spec = CHANNELS.find((c) => c.id === id);
	if (!spec) throw new Error(`未知办公渠道: ${id}`);
	return spec;
}

async function probeChannel(spec: OfficeChannelSpec): Promise<OfficeChannelProbe> {
	const base = { id: spec.id, label: spec.label, binary: spec.binary };
	// slack has two possible binaries; delegate detection to probeAuth via probeSlackCli
	const installed =
		spec.id === "slack"
			? (await probeSlackCli()).available
			: await probeBinary(spec.binary);
	if (!installed) {
		return { ...base, installed: false, authed: false, error: `${spec.binary} 未安装` };
	}
	try {
		const auth = await spec.probeAuth();
		return { ...base, installed: true, ...auth };
	} catch (error) {
		return { ...base, installed: true, authed: false, error: (error as Error).message };
	}
}

/** Probe install/auth state of all office channels in parallel. */
export async function probeOfficeChannels(): Promise<OfficeChannelProbe[]> {
	return Promise.all(CHANNELS.map(probeChannel));
}

/** Open Terminal with the channel's install or login command (macOS). */
export function openOfficeSetupInTerminal(
	channelId: string,
	kind: "install" | "login",
): { opened: boolean; url?: string } {
	const spec = getChannel(channelId);
	if (kind === "login") {
		openInTerminal(spec.loginCommand);
		return { opened: true };
	}
	if (spec.installCommand) {
		openInTerminal(spec.installCommand);
		return { opened: true };
	}
	return { opened: false, url: spec.installUrl };
}

/** Run the channel's official CLI with args (execFile mode, no shell). */
export async function runOfficeCli(
	channelId: string,
	args: string[],
	timeoutMs = 60_000,
	signal?: AbortSignal,
): Promise<OfficeCliResult> {
	const spec = getChannel(channelId);
	const normalizedArgs = normalizeOfficeCliArgs(channelId, args);
	let binary = spec.binary;
	if (spec.id === "slack") {
		const probe = await probeSlackCli();
		if (!probe.available || !probe.backend) throw new Error(probe.error ?? "Slack CLI 不可用");
		binary = probe.backend;
	}
	const result = await runShellDetailed(binary, normalizedArgs, timeoutMs, undefined, { signal });
	return {
		ok: result.exitCode === 0,
		channel: spec.id,
		stdout: result.stdout.trim().slice(0, 8000),
		stderr: result.stderr.trim().slice(0, 2000),
		exitCode: result.exitCode,
	};
}

export function isOfficeChannelId(id: string): id is OfficeChannelId {
	return id in CHANNEL_BINARIES;
}
