import { isClipboardRecallIntent, type LiveContext } from "@fold/context";
import { mockActionPlan } from "@fold/ai";
import type { AgentId } from "@fold/connectors";
import {
	isCodeRepairHint,
	extractFeishuSelfMessageText,
	isFeishuIntent,
	isFeishuSelfMessageIntent,
	isBrowserIntent,
	isGmailIntent,
	isMailCountIntent,
	isPdfDownloadCountIntent,
	isPdfMailDemoIntent,
	isWorkflowIntent,
	needsReactGui,
} from "./capability-resolver.js";
import { normalizeExecutionMode, type ExecutionMode } from "./capability-catalog.js";
import type { ProbeRunResult } from "./probe-runner.js";

export type ExecutionTier = "compiled" | "plan" | "react";

export interface RouteDecision {
	tier: ExecutionTier;
	reason: string;
}

function getExecutionMode(): ExecutionMode {
	return normalizeExecutionMode(process.env.FOLD_EXECUTION_MODE);
}

function isFastChannelIntent(intent: string): boolean {
	return (
		isFeishuIntent(intent) ||
		isGmailIntent(intent) ||
		isBrowserIntent(intent) ||
		/(slack|钉钉|dingtalk|企业微信|wecom)/i.test(intent)
	);
}

function isComplexIntent(intent: string): boolean {
	return isCodeRepairHint(intent) || isWorkflowIntent(intent) || needsReactGui(intent);
}

/** Tier 0: deterministic compiled plans (no LLM). */
export function tryCompiledPlan(intent: string) {
	if (isFeishuSelfMessageIntent(intent)) {
		const text = extractFeishuSelfMessageText(intent);
		if (text) {
			return {
				goal: `通过飞书给用户自己发送消息：${text}`,
				steps: [
					{
						id: "feishu-self",
						skill: "office.cli",
						args: {
							channel: "feishu",
							args: ["contact", "+get-user", "--as", "user", "--format", "json"],
						},
						retryable: true,
						timeout: 10_000,
					},
					{
						id: "feishu-send-self",
						skill: "office.cli",
						args: {
							channel: "feishu",
							args: [
								"im",
								"+messages-send",
								"--as",
								"user",
								"--user-id",
								"{{steps.feishu-self.stdout.data.user.open_id}}",
								"--text",
								text,
							],
						},
						dependsOn: ["feishu-self"],
						retryable: true,
						timeout: 15_000,
					},
				],
				validate: ["office.cli.exitOk"],
			};
		}
	}
	if (isMailCountIntent(intent) || isPdfDownloadCountIntent(intent) || isPdfMailDemoIntent(intent)) {
		return mockActionPlan(intent);
	}
	if (isClipboardRecallIntent(intent)) {
		return {
			goal: intent,
			steps: [
				{
					id: "clipboard-recall",
					skill: "clipboard.recall",
					args: { query: intent },
					retryable: false,
					timeout: 3000,
				},
			],
			validate: ["clipboard.recall.ok"],
		};
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
	const mode = getExecutionMode();

	if (tryCompiledPlan(intent)) {
		return { tier: "compiled", reason: "matched compiled skill pattern" };
	}

	const agentProbe = probeValue<{ enabled?: boolean; agents?: AgentId[] }>(
		probeResult,
		"agent.available",
	);
	const hasAgents = (agentProbe?.agents?.length ?? 0) > 0;
	const agentsEnabled = Boolean(agentProbe?.enabled);

	if (mode === "fold_only") {
		if (isFastChannelIntent(intent)) {
			return { tier: "plan", reason: "fold_only: fast channel via Fold skills" };
		}
		const reactReason = needsReactTier(intent, probeResult);
		if (reactReason) {
			return { tier: "plan", reason: "fold_only: complex task via Fold planner (no local agent)" };
		}
		return { tier: "plan", reason: "fold_only: default planner path" };
	}

	if (isFastChannelIntent(intent) && mode === "auto") {
		return { tier: "plan", reason: "auto: fast channel handled by Fold skills" };
	}

	const reactReason = needsReactTier(intent, probeResult);
	const wantsAgent =
		mode === "local_agent" ? isComplexIntent(intent) || Boolean(reactReason) : isComplexIntent(intent);

	if (wantsAgent) {
		if (!agentsEnabled || !hasAgents) {
			if (mode === "local_agent") {
				return { tier: "plan", reason: "local_agent: no CLI detected, falling back to Fold" };
			}
			if (reactReason) {
				return { tier: "plan", reason: "auto: agent needed but unavailable, Fold best-effort" };
			}
		} else {
			return {
				tier: "react",
				reason:
					mode === "local_agent"
						? "local_agent: delegated to user agent"
						: "auto: complex task delegated to user agent",
			};
		}
	}

	if (reactReason) {
		if (agentsEnabled && hasAgents) {
			return { tier: "react", reason: reactReason };
		}
		return { tier: "plan", reason: "react needed but no local agent CLI detected" };
	}

	const skills = probeValue<{ skills?: string[] }>(probeResult, "skill.registry")?.skills ?? [];
	if (skills.length === 0) {
		if (agentsEnabled && hasAgents) {
			return { tier: "react", reason: "no registered skills available" };
		}
		return { tier: "plan", reason: "no skills; planner may still attempt" };
	}

	return { tier: "plan", reason: "default planner path" };
}
