import type { ActionPlan } from "@fold/ai";
import type { AgentId } from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import { formatContextSummary } from "@fold/context";
import { isGuiIntent } from "./capability-resolver.js";
import type { StepFailure } from "./executor.js";

export function buildReactAgentPlan(
	intent: string,
	agent: AgentId | "auto" = "auto",
	cdpConnected = false,
	cwd?: string,
): ActionPlan {
	const agentArgs: Record<string, unknown> = {
		brief: intent,
		agent,
		allowEdits: true,
	};
	if (cwd) agentArgs.cwd = cwd;

	if (cdpConnected && isGuiIntent(intent)) {
		return {
			goal: intent,
			steps: [
				{
					id: "react-browser",
					skill: "browser.currentPage",
					args: {},
					retryable: true,
					timeout: 15_000,
				},
				{
					id: "react-agent",
					skill: "agent.execute",
					args: {
						...agentArgs,
						brief: [
							intent,
							"",
							"A CDP-connected browser is available. Inspect the current page before acting.",
						].join("\n"),
					},
					dependsOn: ["react-browser"],
					retryable: false,
					timeout: 180_000,
				},
			],
			validate: ["browser.page.ready", "agent.exitOk"],
		};
	}

	return {
		goal: intent,
		steps: [
			{
				id: "react-1",
				skill: "agent.execute",
				args: agentArgs,
				retryable: false,
				timeout: 180_000,
			},
		],
		validate: ["agent.exitOk"],
	};
}

export function buildRepairBrief(intent: string, context: LiveContext, failures: StepFailure[]): string {
	const failureLines = failures
		.map((f) => `- ${f.skill}: ${f.error ?? "failed"}`)
		.join("\n");
	return [
		`Repair task for Fold user intent: ${intent}`,
		"",
		"Primary plan failed with:",
		failureLines,
		"",
		"Live context:",
		formatContextSummary(context),
		"",
		"Try the smallest fix needed, then summarize what changed.",
	].join("\n");
}
