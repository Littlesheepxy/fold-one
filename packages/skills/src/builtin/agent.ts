import { executeAgent, type AgentId } from "@fold/connectors";
import { formatContextSummary } from "@fold/context";
import type { SkillContext } from "../types.js";

export async function agentExecute(args: Record<string, unknown>, ctx: SkillContext) {
	const brief = String(args.brief ?? args.task ?? "").trim();
	if (!brief) throw new Error("agent.execute: brief required");

	const agent = (args.agent as AgentId | "auto" | undefined) ?? "auto";
	const cwd = typeof args.cwd === "string" ? args.cwd : undefined;
	const allowEdits = args.allowEdits !== false;
	const failedSteps = Array.isArray(args.failedSteps)
		? args.failedSteps.map((step) => String(step))
		: [];

	ctx.emit({
		type: "progress",
		message: `Running local agent subagent (${agent})`,
	});

	return executeAgent(
		{
			brief,
			contextSnapshot: formatContextSummary(ctx.liveContext),
			cwd,
			agent,
			maxTurns: typeof args.maxTurns === "number" ? args.maxTurns : 10,
			timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : 180_000,
			allowEdits,
		},
		failedSteps,
	);
}
