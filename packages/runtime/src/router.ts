import type { LiveContext } from "@fold/context";
import { mockActionPlan } from "@fold/ai";
import type { AgentId } from "@fold/connectors";
import {
	isMailCountIntent,
	isPdfDownloadCountIntent,
	isPdfMailDemoIntent,
	needsReactGui,
} from "./capability-resolver.js";
import type { ProbeRunResult } from "./probe-runner.js";

export type ExecutionTier = "compiled" | "plan" | "react";

export interface RouteDecision {
	tier: ExecutionTier;
	reason: string;
}

/** Tier 0: deterministic compiled plans (no LLM). */
export function tryCompiledPlan(intent: string) {
	if (isMailCountIntent(intent) || isPdfDownloadCountIntent(intent) || isPdfMailDemoIntent(intent)) {
		return mockActionPlan(intent);
	}
	return null;
}

function probeValue<T>(probeResult: ProbeRunResult | undefined, id: string): T | undefined {
	const probe = probeResult?.probes.find((p) => p.id === id);
	if (!probe || probe.status !== "ok") return undefined;
	return probe.value as T;
}

function needsReactTier(intent: string, probeResult?: ProbeRunResult): string | null {
	if (needsReactGui(intent)) {
		return "intent requires dynamic GUI interaction";
	}

	const mailProbe = probeValue<{ readProvider?: string }>(probeResult, "mail.available");
	if (
		isMailCountIntent(intent) &&
		mailProbe?.readProvider &&
		!["apple-mail", "gmail-cli", "gmail-web"].includes(mailProbe.readProvider) &&
		process.platform === "darwin"
	) {
		return "mail provider needs browser or agent repair";
	}

	return null;
}

export function resolveTier(
	intent: string,
	_context: LiveContext,
	probeResult?: ProbeRunResult,
): RouteDecision {
	if (tryCompiledPlan(intent)) {
		return { tier: "compiled", reason: "matched compiled skill pattern" };
	}

	const reactReason = needsReactTier(intent, probeResult);
	if (reactReason) {
		const agentProbe = probeValue<{ enabled?: boolean; agents?: AgentId[] }>(
			probeResult,
			"agent.available",
		);
		if (agentProbe?.enabled && (agentProbe.agents?.length ?? 0) === 0) {
			return { tier: "plan", reason: "react needed but no local agent CLI detected" };
		}
		return { tier: "react", reason: reactReason };
	}

	const skills = probeValue<{ skills?: string[] }>(probeResult, "skill.registry")?.skills ?? [];
	if (skills.length === 0) {
		return { tier: "react", reason: "no registered skills available" };
	}

	return { tier: "plan", reason: "default planner path" };
}
