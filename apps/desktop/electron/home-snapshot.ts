import type { LiveContext } from "@fold/context";
import { isAgentSubagentsEnabled, probeAllAgents } from "@fold/connectors";
import { listRecentEpisodes } from "@fold/memory";
import { loadProfileMemories } from "@fold/memory";
import { buildCapabilitySnapshot, runProbes, type CapabilitySnapshot } from "@fold/runtime";
import { hasRealAsr, loadConfig } from "./config.js";
import { probeAccessibility } from "./permissions.js";

export interface HomeEpisode {
	id: string;
	intent: string;
	status: string;
	timestamp: number;
	summary: string;
}

export interface HomeConnection {
	id: string;
	label: string;
	status: "ok" | "warn" | "error";
	detail?: string;
	meta?: Record<string, string | boolean | null | undefined>;
}

export interface HomeConfigSummary {
	hasPlannerKey: boolean;
	hasAsr: boolean;
	mailProvider: string;
	allowAgentSubagents: boolean;
	allowWorkbuddy: boolean;
	allowUitars: boolean;
}

export interface HomeSnapshot {
	episodes: HomeEpisode[];
	liveContext: {
		activeApp: string | null;
		activeWindow: string | null;
		recentUrls: Array<{ url: string; title: string }>;
		recentFiles: Array<{ path: string; name: string }>;
	};
	connections: HomeConnection[];
	capabilitySnapshot: CapabilitySnapshot;
	configSummary: HomeConfigSummary;
	userProfile: ReturnType<typeof loadProfileMemories>;
}

function probeOk<T>(probes: Awaited<ReturnType<typeof runProbes>>, id: string): T | undefined {
	const probe = probes.probes.find((p) => p.id === id);
	if (!probe || probe.status !== "ok") return undefined;
	return probe.value as T;
}

function buildConnections(
	probes: Awaited<ReturnType<typeof runProbes>>,
	agentStatuses: Awaited<ReturnType<typeof probeAllAgents>>,
): HomeConnection[] {
	const rows: HomeConnection[] = [];
	const agentsEnabled = isAgentSubagentsEnabled();

	for (const agent of agentStatuses) {
		rows.push({
			id: agent.id,
			label: agent.label,
			status: !agentsEnabled ? "error" : agent.available ? "ok" : "warn",
			detail: !agentsEnabled
				? "未开启（设置里打开「允许本地 Agent Subagent」）"
				: agent.available
					? "CLI 已就绪"
					: (agent.error ?? "未安装"),
		});
	}

	const gmail = probeOk<{ available?: boolean; backend?: string; error?: string }>(probes, "gmail.cli");
	rows.push({
		id: "gmail",
		label: "Gmail CLI",
		status: gmail?.available ? "ok" : gmail?.backend ? "warn" : "error",
		detail: gmail?.available
			? `终端发信 · ${gmail.backend ?? "已授权"}`
			: (gmail?.error ?? "未安装或未登录"),
		meta: { backend: gmail?.backend ?? null },
	});

	const nango = probeOk<{
		configured?: boolean;
		connected?: boolean;
		connections?: Array<{ providerConfigKey: string }>;
		mode?: "local" | "hub";
		error?: string;
	}>(probes, "nango.available");
	const nangoModeLabel = nango?.mode === "hub" ? "Fold Hub" : "Nango 直连";
	rows.push({
		id: "nango",
		label: "托管授权",
		status: nango?.connected ? "ok" : nango?.configured ? "warn" : "error",
		detail: nango?.connected
			? `${nangoModeLabel} · 已授权 ${nango.connections?.length ?? 0} 个应用 · ${(nango.connections ?? [])
					.map((c) => c.providerConfigKey)
					.join(", ")}`
			: nango?.configured
				? (nango.error ?? `${nangoModeLabel} · 已配置，还没有授权任何应用`)
				: "未配置 Fold Hub API Key",
	});

	const office = probeOk<
		Array<{ id: string; installed: boolean; authed: boolean; error?: string }>
	>(probes, "office.channels");
	const officeLabels: Record<string, string> = {
		feishu: "飞书",
		github: "GitHub",
		dingtalk: "钉钉",
		wecom: "企业微信",
		slack: "Slack",
	};
	for (const channel of office ?? []) {
		rows.push({
			id: `office-${channel.id}`,
			label: officeLabels[channel.id] ?? channel.id,
			status: channel.authed ? "ok" : channel.installed ? "warn" : "error",
			detail: channel.authed
				? "CLI 已登录，可直接调用"
				: (channel.error ?? (channel.installed ? "已安装，还没登录" : "未安装")),
			meta: { channel: channel.id, installed: channel.installed, authed: channel.authed },
		});
	}

	const cdp = probeOk<{
		connected?: boolean;
		cdpUrl?: string;
		pageCount?: number;
		mode?: "extension" | "cdp";
		error?: string;
	}>(
		probes,
		"browser.cdp",
	);
	rows.push({
		id: "cdp",
		label: "Chrome 浏览器",
		status: cdp?.connected ? "ok" : cdp?.cdpUrl ? "warn" : "error",
		detail: cdp?.connected
			? cdp.mode === "extension"
				? `Playwright Bridge · ${cdp.pageCount ?? 0} 个网页标签`
				: `Chrome 调试通道 · ${cdp.pageCount ?? 0} 个标签页`
			: (cdp?.error ?? "未连接 — 请安装 Playwright Bridge 或开启 Chrome remote debugging"),
		meta: { cdpUrl: cdp?.cdpUrl ?? null },
	});

	const screen = probeOk<{ available?: boolean; error?: string }>(probes, "screen.capture");
	rows.push({
		id: "screen",
		label: "屏幕读取",
		status: screen?.available ? "ok" : "warn",
		detail: screen?.available ? "截屏与 OCR 可用" : (screen?.error ?? "需授予屏幕录制权限"),
	});

	const ax = probeAccessibility(false);
	rows.push({
		id: "accessibility",
		label: "辅助功能",
		status: ax.available ? "ok" : "error",
		detail: ax.available
			? `已授权 · ${ax.appLabel}`
			: (ax.error ?? `需在系统设置中开启「${ax.appLabel}」`),
		meta: ax.bundlePath ? { bundlePath: ax.bundlePath } : undefined,
	});

	const uitars = probeOk<{ enabled?: boolean; available?: boolean; model?: string }>(
		probes,
		"uitars.available",
	);
	rows.push({
		id: "uitars",
		label: "UI-TARS 桌面操控",
		status: uitars?.enabled && uitars.available ? "ok" : uitars?.enabled ? "warn" : "error",
		detail: uitars?.enabled
			? uitars.available
				? `nut-js 可用 · ${uitars.model ?? "VLM 已配置"}`
				: "未配置 VLM API Key"
			: "未开启",
	});

	const wb = probeOk<{ enabled?: boolean; available?: boolean; toolCount?: number; error?: string }>(
		probes,
		"workbuddy.available",
	);
	rows.push({
		id: "workbuddy",
		label: "Work Buddy",
		status: wb?.enabled && wb.available ? "ok" : wb?.enabled ? "warn" : "error",
		detail: wb?.enabled
			? wb.available
				? wb.toolCount
					? `Gateway 在线 · ${wb.toolCount} 个 MCP 工具`
					: "Gateway 在线"
				: (wb.error ?? "Gateway 离线")
			: "未开启",
	});

	return rows;
}

function buildConfigSummary(): HomeConfigSummary {
	const config = loadConfig();
	return {
		hasPlannerKey: Boolean(
			config.openrouterApiKey?.trim() ||
				config.openaiApiKey?.trim() ||
				process.env.OPENROUTER_API_KEY?.trim() ||
				process.env.OPENAI_API_KEY?.trim(),
		),
		hasAsr: hasRealAsr(),
		mailProvider: config.mailProvider ?? "auto",
		allowAgentSubagents: config.allowAgentSubagents ?? false,
		allowWorkbuddy: config.allowWorkbuddy ?? true,
		allowUitars: config.allowUitars ?? false,
	};
}

export async function buildHomeSnapshot(getLiveContext: () => LiveContext): Promise<HomeSnapshot> {
	const liveContext = getLiveContext();
	const config = loadConfig();
	const nango = { configured: Boolean(config.hubApiKey?.trim() || config.nangoSecretKey?.trim()) };
	const [probes, agentStatuses] = await Promise.all([
		runProbes("", liveContext),
		probeAllAgents(),
	]);
	const ax = probeAccessibility(false);
	const capabilitySnapshot = buildCapabilitySnapshot(probes, agentStatuses, {
		executionMode: config.executionMode,
		enabledCapabilities: config.enabledCapabilities,
		preferredExecutor: config.preferredExecutor,
		skipLocalAgent: config.skipLocalAgent,
		hasPlannerKey: Boolean(
			config.openrouterApiKey?.trim() ||
				config.openaiApiKey?.trim() ||
				process.env.OPENROUTER_API_KEY?.trim() ||
				process.env.OPENAI_API_KEY?.trim(),
		),
		hubConfigured: nango.configured,
	}, ax.available);
	const episodes = listRecentEpisodes(10).map((ep) => ({
		id: ep.id,
		intent: ep.intent,
		status: ep.status,
		timestamp: ep.timestamp,
		summary: ep.summary,
	}));

	return {
		episodes,
		liveContext: {
			activeApp: liveContext.activeApp,
			activeWindow: liveContext.activeWindow,
			recentUrls: liveContext.recentUrls.slice(0, 5).map((u) => ({
				url: u.url,
				title: u.title,
			})),
			recentFiles: liveContext.recentFiles.slice(0, 5).map((f) => ({
				path: f.path,
				name: f.name,
			})),
		},
		connections: buildConnections(probes, agentStatuses),
		capabilitySnapshot,
		configSummary: buildConfigSummary(),
		userProfile: loadProfileMemories(),
	};
}
