import type { LiveContext } from "@fold/context";
import { isAgentSubagentsEnabled, probeAllAgents } from "@fold/connectors";
import { listRecentEpisodes } from "@fold/memory";
import { runProbes } from "@fold/runtime";
import { hasRealAsr, loadConfig } from "./config.js";

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
	configSummary: HomeConfigSummary;
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
			? gmail.backend ?? "已授权"
			: (gmail?.error ?? "未安装或未登录"),
		meta: { backend: gmail?.backend ?? null },
	});

	const cdp = probeOk<{ connected?: boolean; cdpUrl?: string; error?: string }>(probes, "browser.cdp");
	rows.push({
		id: "cdp",
		label: "Chrome CDP",
		status: cdp?.connected ? "ok" : cdp?.cdpUrl ? "warn" : "error",
		detail: cdp?.connected ? "已连接" : (cdp?.error ?? "未配置"),
		meta: { cdpUrl: cdp?.cdpUrl ?? null },
	});

	const screen = probeOk<{ available?: boolean; error?: string }>(probes, "screen.capture");
	rows.push({
		id: "screen",
		label: "屏幕录制",
		status: screen?.available ? "ok" : "warn",
		detail: screen?.available ? "可用" : (screen?.error ?? "未授权"),
	});

	const uitars = probeOk<{ enabled?: boolean; available?: boolean }>(probes, "uitars.available");
	rows.push({
		id: "uitars",
		label: "UI-TARS",
		status: uitars?.enabled && uitars.available ? "ok" : uitars?.enabled ? "warn" : "error",
		detail: uitars?.enabled ? (uitars.available ? "可用" : "未配置 VLM") : "未开启",
	});

	const wb = probeOk<{ enabled?: boolean; available?: boolean }>(probes, "workbuddy.available");
	rows.push({
		id: "workbuddy",
		label: "Work Buddy",
		status: wb?.enabled && wb.available ? "ok" : wb?.enabled ? "warn" : "error",
		detail: wb?.enabled ? (wb.available ? "Gateway 在线" : "Gateway 离线") : "未开启",
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
	const [probes, agentStatuses] = await Promise.all([
		runProbes("", liveContext),
		probeAllAgents(),
	]);
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
		configSummary: buildConfigSummary(),
	};
}
