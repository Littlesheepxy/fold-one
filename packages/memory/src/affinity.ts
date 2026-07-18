/**
 * 执行器/渠道亲和度：从近期成功 episode 计数，平票时作排序信号。
 * 不替代点名规则；用户 preferredExecutor 永远更高。
 */
import { listRecentEpisodes, type Episode } from "./episode.js";

export const OFFICE_AFFINITY_IDS = ["feishu", "dingtalk", "wecom"] as const;
export type OfficeAffinityId = (typeof OFFICE_AFFINITY_IDS)[number];

export const AGENT_AFFINITY_IDS = ["claude-code", "codex", "cursor"] as const;
export type AgentAffinityId = (typeof AGENT_AFFINITY_IDS)[number];

function isOffice(id: string): id is OfficeAffinityId {
	return (OFFICE_AFFINITY_IDS as readonly string[]).includes(id);
}

function isAgent(id: string): id is AgentAffinityId {
	return (AGENT_AFFINITY_IDS as readonly string[]).includes(id);
}

function episodeOk(status: string): boolean {
	return status === "success" || status === "recovered";
}

/** 按 task_class 域前缀统计成功次数。 */
export function scoreOfficeAffinity(
	dataDir?: string,
	lookback = 80,
): Record<OfficeAffinityId, number> {
	const scores: Record<OfficeAffinityId, number> = {
		feishu: 0,
		dingtalk: 0,
		wecom: 0,
	};
	for (const ep of listRecentEpisodes(lookback, dataDir)) {
		if (!episodeOk(ep.status)) continue;
		const domain = (ep.taskClass ?? "").split(".")[0] ?? "";
		if (isOffice(domain)) scores[domain] += 1;
	}
	return scores;
}

/** 候选渠道按历史成功次数降序；同分保持原序。 */
export function rankOfficeChannels(
	candidates: readonly OfficeAffinityId[],
	dataDir?: string,
	lookback = 80,
): OfficeAffinityId[] {
	const scores = scoreOfficeAffinity(dataDir, lookback);
	return [...candidates].sort((a, b) => {
		const diff = (scores[b] ?? 0) - (scores[a] ?? 0);
		if (diff !== 0) return diff;
		return candidates.indexOf(a) - candidates.indexOf(b);
	});
}

function extractAgentId(ep: Episode): AgentAffinityId | null {
	if (ep.agentEventsJson) {
		try {
			const events = JSON.parse(ep.agentEventsJson) as Array<{ source?: string }>;
			for (const event of events) {
				if (event.source && isAgent(event.source)) return event.source;
			}
		} catch {
			/* ignore */
		}
	}
	try {
		const plan = JSON.parse(ep.planJson) as {
			steps?: Array<{ skill?: string; args?: { agent?: string } }>;
		};
		for (const step of plan.steps ?? []) {
			const agent = step.args?.agent;
			if (step.skill === "agent.execute" && agent && isAgent(agent)) return agent;
		}
	} catch {
		/* ignore */
	}
	return null;
}

export function scoreAgentAffinity(
	dataDir?: string,
	lookback = 80,
): Record<string, { ok: number; total: number }> {
	const scores: Record<string, { ok: number; total: number }> = {};
	for (const ep of listRecentEpisodes(lookback, dataDir)) {
		const agentId = extractAgentId(ep);
		if (!agentId) continue;
		const bucket = scores[agentId] ?? (scores[agentId] = { ok: 0, total: 0 });
		bucket.total += 1;
		if (episodeOk(ep.status)) bucket.ok += 1;
	}
	return scores;
}

/** Laplace 平滑成功率，同分按成功次数，再保持原序。 */
export function rankAgents(candidates: readonly string[], dataDir?: string, lookback = 80): string[] {
	const scores = scoreAgentAffinity(dataDir, lookback);
	const scoreOf = (id: string) => {
		const row = scores[id];
		if (!row || row.total === 0) return { rate: 0, ok: 0 };
		return { rate: (row.ok + 1) / (row.total + 2), ok: row.ok };
	};
	return [...candidates].sort((a, b) => {
		const sa = scoreOf(a);
		const sb = scoreOf(b);
		if (sb.rate !== sa.rate) return sb.rate - sa.rate;
		if (sb.ok !== sa.ok) return sb.ok - sa.ok;
		return candidates.indexOf(a) - candidates.indexOf(b);
	});
}

/**
 * 选本地 Agent：显式 preferred（非 auto/workbuddy）且可用 → 用之；
 * 否则按亲和度排序取第一个。
 */
export function pickPreferredAgent(
	candidates: readonly string[],
	opts?: { preferred?: string | null; dataDir?: string; lookback?: number },
): string | undefined {
	if (candidates.length === 0) return undefined;
	const preferred = opts?.preferred?.trim();
	if (
		preferred &&
		preferred !== "auto" &&
		preferred !== "workbuddy" &&
		candidates.includes(preferred)
	) {
		return preferred;
	}
	return rankAgents(candidates, opts?.dataDir, opts?.lookback)[0];
}
