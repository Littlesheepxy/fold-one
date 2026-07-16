import type { AgentId, AgentProbeStatus } from "@fold/connectors";
import type { ProbeRunResult } from "./probe-runner.js";

export type ExecutionMode = "auto" | "local_agent" | "fold_only";
export type CapabilityLayer = 0 | 1 | 2;
export type CapabilityCategory = "communicate" | "browser" | "mail" | "code" | "workflow" | "hub";
export type CapabilityStatus =
	| "ready"
	| "needs_connect"
	| "needs_fold_hub"
	| "disabled"
	| "unavailable";

export interface CapabilityConfig {
	executionMode?: ExecutionMode;
	enabledCapabilities?: string[];
	preferredExecutor?: AgentId | "workbuddy" | "auto";
	skipLocalAgent?: boolean;
	hasPlannerKey?: boolean;
	hubConfigured?: boolean;
}

export interface CapabilityDef {
	id: string;
	label: string;
	description: string;
	layer: CapabilityLayer;
	category: CapabilityCategory;
	group: "communicate" | "browser" | "hub";
	connectTarget?: string;
	chipIcon?: string;
}

export interface CapabilityItem {
	id: string;
	label: string;
	description: string;
	layer: CapabilityLayer;
	category: CapabilityCategory;
	group: "communicate" | "browser" | "hub";
	status: CapabilityStatus;
	enabled: boolean;
	provider?: string;
	detail?: string;
	connectTarget?: string;
	connectKind?: "login" | "install";
}

export interface ExecutorItem {
	id: AgentId | "workbuddy";
	label: string;
	available: boolean;
	capabilities: string[];
	isDefault: boolean;
	error?: string;
	detail?: string;
	connectTarget?: string;
}

export interface CapabilitySnapshot {
	executionMode: ExecutionMode;
	capabilities: CapabilityItem[];
	executors: ExecutorItem[];
	groups: Array<{
		id: "communicate" | "browser" | "hub";
		label: string;
		ready: number;
		total: number;
	}>;
	summary: {
		ready: number;
		total: number;
		modeLabel: string;
		executorLabel?: string;
	};
}

const CAPABILITY_DEFS: CapabilityDef[] = [
	{
		id: "im.feishu",
		label: "飞书",
		description: "消息、日历、文档",
		layer: 0,
		category: "communicate",
		group: "communicate",
		connectTarget: "office-feishu",
	},
	{
		id: "im.dingtalk",
		label: "钉钉",
		description: "消息、日历、待办",
		layer: 0,
		category: "communicate",
		group: "communicate",
		connectTarget: "office-dingtalk",
	},
	{
		id: "im.wecom",
		label: "企微",
		description: "消息、文档、日程",
		layer: 0,
		category: "communicate",
		group: "communicate",
		connectTarget: "office-wecom",
	},
	{
		id: "im.slack",
		label: "Slack",
		description: "频道与未读消息",
		layer: 0,
		category: "communicate",
		group: "communicate",
		connectTarget: "office-slack",
	},
	{
		id: "mail.gmail",
		label: "Gmail",
		description: "终端读写邮件",
		layer: 0,
		category: "mail",
		group: "communicate",
		connectTarget: "gmail",
	},
	{
		id: "browser.read",
		label: "Chrome",
		description: "读取当前网页",
		layer: 0,
		category: "browser",
		group: "browser",
		connectTarget: "cdp",
	},
	{
		id: "screen.read",
		label: "读屏",
		description: "截屏与 OCR",
		layer: 0,
		category: "browser",
		group: "browser",
		connectTarget: "screen",
	},
	{
		id: "code.local",
		label: "写代码",
		description: "本地 Agent 改仓库",
		layer: 1,
		category: "code",
		group: "communicate",
	},
	{
		id: "workflow.workbuddy",
		label: "工作流",
		description: "Work Buddy 跨应用",
		layer: 1,
		category: "workflow",
		group: "communicate",
		connectTarget: "workbuddy",
	},
	{
		id: "apps.hub",
		label: "托管授权",
		description: "Fold Hub 连接更多应用",
		layer: 2,
		category: "hub",
		group: "hub",
		connectTarget: "nango",
	},
];

const EXECUTOR_CAPS: Record<AgentId | "workbuddy", string[]> = {
	"claude-code": ["写代码", "改仓库", "续接会话"],
	codex: ["写代码", "跑测试", "改多文件"],
	cursor: ["写代码", "IDE 仓库"],
	workbuddy: ["跨应用", "工作流"],
};

const MODE_LABELS: Record<ExecutionMode, string> = {
	auto: "自动",
	local_agent: "自己的 Agent",
	fold_only: "仅用 Fold",
};

function probeValue<T>(probes: ProbeRunResult, id: string): T | undefined {
	const probe = probes.probes.find((p) => p.id === id);
	if (!probe || probe.status !== "ok") return undefined;
	return probe.value as T;
}

function officeChannel(
	probes: ProbeRunResult,
	channelId: string,
): { installed: boolean; authed: boolean; error?: string } | undefined {
	const channels = probeValue<Array<{ id: string; installed: boolean; authed: boolean; error?: string }>>(
		probes,
		"office.channels",
	);
	return channels?.find((c) => c.id === channelId);
}

function resolveCapabilityStatus(
	def: CapabilityDef,
	probes: ProbeRunResult,
	accessibilityAvailable: boolean,
): Pick<CapabilityItem, "status" | "provider" | "detail" | "connectTarget" | "connectKind"> {
	switch (def.id) {
		case "im.feishu": {
			const row = officeChannel(probes, "feishu");
			if (row?.authed) return { status: "ready", provider: "lark-cli", detail: "已连接" };
			if (row?.installed)
				return {
					status: "needs_connect",
					detail: "登录飞书即可使用",
					connectTarget: def.connectTarget,
					connectKind: "login",
				};
			return {
				status: "needs_connect",
				detail: "连接飞书即可使用",
				connectTarget: def.connectTarget,
				connectKind: "install",
			};
		}
		case "im.dingtalk": {
			const row = officeChannel(probes, "dingtalk");
			if (row?.authed) return { status: "ready", provider: "dws", detail: "CLI 已登录" };
			if (row?.installed)
				return {
					status: "needs_connect",
					detail: row.error ?? "已安装，需登录",
					connectTarget: def.connectTarget,
					connectKind: "login",
				};
			return {
				status: "needs_connect",
				detail: row?.error ?? "未安装",
				connectTarget: def.connectTarget,
				connectKind: "install",
			};
		}
		case "im.wecom": {
			const row = officeChannel(probes, "wecom");
			if (row?.authed) return { status: "ready", provider: "wecom-cli", detail: "CLI 已登录" };
			if (row?.installed)
				return {
					status: "needs_connect",
					detail: row.error ?? "已安装，需登录",
					connectTarget: def.connectTarget,
					connectKind: "login",
				};
			return {
				status: "needs_connect",
				detail: row?.error ?? "未安装",
				connectTarget: def.connectTarget,
				connectKind: "install",
			};
		}
		case "im.slack": {
			const slack = probeValue<{ available?: boolean; error?: string }>(probes, "slack.available");
			const row = officeChannel(probes, "slack");
			if (slack?.available || row?.authed)
				return { status: "ready", provider: "slack-cli", detail: "CLI 已就绪" };
			return {
				status: "needs_connect",
				detail: slack?.error ?? row?.error ?? "需安装并登录",
				connectTarget: def.connectTarget,
				connectKind: row?.installed ? "login" : "install",
			};
		}
		case "mail.gmail": {
			const gmail = probeValue<{ available?: boolean; backend?: string; error?: string }>(
				probes,
				"gmail.cli",
			);
			const nango = probeValue<{
				connections?: Array<{ providerConfigKey: string }>;
			}>(probes, "nango.available");
			const browser = probeValue<{
				connected?: boolean;
				mailUrl?: string | null;
			}>(probes, "browser.cdp");
			if (gmail?.available)
				return { status: "ready", provider: gmail.backend ?? "gmail-cli", detail: "已连接" };
			if (nango?.connections?.some((connection) => connection.providerConfigKey === "google-mail"))
				return { status: "ready", provider: "gmail-nango", detail: "已连接" };
			if (browser?.connected && /mail\.google\.com/i.test(browser.mailUrl ?? ""))
				return { status: "ready", provider: "gmail-web", detail: "浏览器已连接" };
			return {
				status: "needs_connect",
				detail: "登录 Gmail 即可使用",
				connectTarget: def.connectTarget,
				connectKind: "login",
			};
		}
		case "browser.read": {
			const cdp = probeValue<{
				connected?: boolean;
				pageCount?: number;
				mode?: string;
				error?: string;
			}>(probes, "browser.cdp");
			if (cdp?.connected)
				return {
					status: "ready",
					provider: cdp.mode === "extension" ? "Playwright Bridge" : "Chrome CDP",
					detail: `${cdp.pageCount ?? 0} 个标签`,
				};
			return {
				status: "needs_connect",
				detail: cdp?.error ?? "未连接 Chrome",
				connectTarget: def.connectTarget,
			};
		}
		case "screen.read": {
			const screen = probeValue<{ available?: boolean; error?: string }>(probes, "screen.capture");
			if (screen?.available && accessibilityAvailable)
				return { status: "ready", provider: "系统", detail: "截屏与读屏可用" };
			return {
				status: "needs_connect",
				detail: screen?.error ?? "需授予屏幕录制与辅助功能权限",
				connectTarget: def.connectTarget,
			};
		}
		case "code.local": {
			const agent = probeValue<{ enabled?: boolean; agents?: AgentId[] }>(probes, "agent.available");
			if (agent?.enabled && (agent.agents?.length ?? 0) > 0)
				return {
					status: "ready",
					provider: agent.agents?.[0],
					detail: `${agent.agents?.length ?? 0} 个 Agent 可用`,
				};
			return {
				status: "needs_connect",
				detail: agent?.enabled ? "未检测到本地 Agent CLI" : "需在连接页启用",
			};
		}
		case "workflow.workbuddy": {
			const wb = probeValue<{
				enabled?: boolean;
				available?: boolean;
				toolCount?: number;
				error?: string;
			}>(probes, "workbuddy.available");
			if (wb?.enabled && wb.available) {
				return {
					status: "ready",
					provider: "Work Buddy",
					detail: wb.toolCount ? `Gateway 在线 · ${wb.toolCount} 个工具` : "Gateway 在线",
				};
			}
			return {
				status: "needs_connect",
				detail: wb?.error ?? (wb?.enabled ? "Gateway 离线" : "未启用"),
				connectTarget: "workbuddy",
			};
		}
		case "apps.hub": {
			const nango = probeValue<{
				configured?: boolean;
				connected?: boolean;
				connections?: Array<{ providerConfigKey: string }>;
				error?: string;
			}>(probes, "nango.available");
			if (nango?.connected)
				return {
					status: "ready",
					provider: "Fold Hub",
					detail: `已授权 ${nango.connections?.length ?? 0} 个应用`,
				};
			if (nango?.configured)
				return {
					status: "needs_connect",
					detail: nango.error ?? "已配置，待授权应用",
					connectTarget: def.connectTarget,
					connectKind: "login",
				};
			return {
				status: "needs_fold_hub",
				detail: "需配置 Fold Hub API Key",
				connectTarget: def.connectTarget,
				connectKind: "login",
			};
		}
		default:
			return { status: "unavailable" };
	}
}

function defaultEnabled(def: CapabilityDef, status: CapabilityStatus, mode: ExecutionMode): boolean {
	if (status !== "ready" && status !== "needs_connect") return false;
	if (def.layer === 2) return mode === "fold_only";
	if (def.layer === 1) return mode === "local_agent";
	return def.layer === 0;
}

function isExplicitlyEnabled(id: string, enabled: string[] | undefined, fallback: boolean): boolean {
	if (!enabled) return fallback;
	return enabled.includes(id);
}

export function normalizeExecutionMode(value: unknown): ExecutionMode {
	if (value === "local_agent" || value === "fold_only" || value === "auto") return value;
	return "auto";
}

/** Derive runtime allow-flags from execution mode + enabled capabilities. */
export function deriveExecutionFlags(config: CapabilityConfig): {
	allowAgentSubagents: boolean;
	allowWorkbuddy: boolean;
} {
	const mode = normalizeExecutionMode(config.executionMode);
	const enabled = config.enabledCapabilities ?? [];
	const wantsCode = enabled.includes("code.local") || mode === "local_agent";
	const wantsWb = enabled.includes("workflow.workbuddy");
	if (mode === "fold_only") {
		return { allowAgentSubagents: false, allowWorkbuddy: false };
	}
	if (mode === "local_agent") {
		return { allowAgentSubagents: true, allowWorkbuddy: wantsWb };
	}
	return {
		allowAgentSubagents: wantsCode,
		allowWorkbuddy: wantsWb || enabled.length === 0,
	};
}

export function buildCapabilitySnapshot(
	probes: ProbeRunResult,
	agentStatuses: AgentProbeStatus[],
	config: CapabilityConfig,
	accessibilityAvailable = true,
): CapabilitySnapshot {
	const mode = normalizeExecutionMode(config.executionMode);
	const layer0 = CAPABILITY_DEFS.filter((d) => d.layer === 0);
	const layer1 = CAPABILITY_DEFS.filter((d) => d.layer === 1);
	const layer2 = CAPABILITY_DEFS.filter((d) => d.layer === 2);

	const visibleDefs =
		mode === "fold_only"
			? [...layer0, ...layer2]
			: mode === "local_agent"
				? [...layer0, ...layer1]
				: [...layer0, ...layer1, ...layer2];

	const capabilities: CapabilityItem[] = visibleDefs.map((def) => {
		const resolved = resolveCapabilityStatus(def, probes, accessibilityAvailable);
		const fallbackEnabled = defaultEnabled(def, resolved.status, mode);
		return {
			id: def.id,
			label: def.label,
			description: def.description,
			layer: def.layer,
			category: def.category,
			group: def.group,
			enabled: isExplicitlyEnabled(def.id, config.enabledCapabilities, fallbackEnabled),
			...resolved,
		};
	});

	const wb = probeValue<{
		enabled?: boolean;
		available?: boolean;
		toolCount?: number;
		error?: string;
	}>(probes, "workbuddy.available");
	const preferred = config.preferredExecutor ?? "auto";

	const executors: ExecutorItem[] = [
		...agentStatuses.map((agent) => ({
			id: agent.id,
			label: agent.label,
			available: agent.available,
			capabilities: EXECUTOR_CAPS[agent.id],
			isDefault:
				preferred === agent.id ||
				(preferred === "auto" && agent.available && agentStatuses.find((a) => a.available)?.id === agent.id),
			error: agent.error,
			detail: agent.available ? `已连接 · ${EXECUTOR_CAPS[agent.id].slice(0, 2).join("、")}` : undefined,
			connectTarget:
				agent.id === "codex"
					? "agent-codex"
					: agent.id === "claude-code"
						? "agent-claude-code"
						: agent.id === "cursor"
							? "agent-cursor"
							: undefined,
		})),
		{
			id: "workbuddy" as const,
			label: "Work Buddy",
			available: Boolean(wb?.available),
			capabilities: EXECUTOR_CAPS.workbuddy,
			isDefault: preferred === "workbuddy",
			detail: wb?.available
				? wb.toolCount
					? `${wb.toolCount} 个 MCP 工具`
					: "Gateway 在线"
				: undefined,
			error: wb?.available ? undefined : (wb?.error ?? (wb?.enabled ? "Gateway 离线" : "未启用")),
			connectTarget: "workbuddy",
		},
	];

	const layer0Caps = capabilities.filter((c) => c.layer === 0);
	const ready = layer0Caps.filter((c) => c.status === "ready").length;
	const total = layer0Caps.length;

	const groupMeta: Array<{ id: "communicate" | "browser" | "hub"; label: string }> = [
		{ id: "communicate", label: "沟通协作" },
		{ id: "browser", label: "浏览与读屏" },
		{ id: "hub", label: "更多应用" },
	];

	const groups = groupMeta
		.map((g) => {
			const items = capabilities.filter((c) => c.group === g.id);
			if (items.length === 0) return null;
			return {
				...g,
				ready: items.filter((c) => c.status === "ready").length,
				total: items.length,
			};
		})
		.filter((g): g is NonNullable<typeof g> => g !== null);

	const defaultExecutor = executors.find((e) => e.isDefault && e.available);

	return {
		executionMode: mode,
		capabilities,
		executors: mode === "fold_only" ? [] : executors,
		groups,
		summary: {
			ready,
			total,
			modeLabel: MODE_LABELS[mode],
			executorLabel: defaultExecutor?.label,
		},
	};
}

export function listCapabilityDefs(): readonly CapabilityDef[] {
	return CAPABILITY_DEFS;
}
