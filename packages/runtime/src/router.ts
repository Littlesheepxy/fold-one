import type { LiveContext } from "@fold/context";
import { mockActionPlan } from "@fold/ai";
import type { AgentId } from "@fold/connectors";
import type { ProbeRunResult } from "./probe-runner.js";

export type ExecutionTier = "compiled" | "plan" | "react";

export interface RouteDecision {
	tier: ExecutionTier;
	reason: string;
}

const REACT_HINTS = [
	/点击/,
	/拖拽/,
	/按钮/,
	/表单/,
	/登录/,
	/截图/,
	/看屏幕/,
	/页面.*操作/,
	/browser.*use/i,
	/帮我填/,
	/模拟点击/,
];

function isMailCountIntent(intent: string): boolean {
	return (
		/(邮件|mail)/i.test(intent) &&
		/(多少|几封|待处理|未读|状态|count|unread|pending)/i.test(intent)
	);
}

function isPdfDownloadCountIntent(intent: string): boolean {
	return (
		/(download|下载)/i.test(intent) &&
		/pdf/i.test(intent) &&
		/(多少|几个|count)/i.test(intent)
	);
}

function isPdfMailDemoIntent(intent: string): boolean {
	return /刚下载.*pdf.*(邮件|mail|发)/i.test(intent);
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
	if (REACT_HINTS.some((pattern) => pattern.test(intent))) {
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
