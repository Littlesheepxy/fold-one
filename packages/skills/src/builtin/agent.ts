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

	const agentLabel = agent === "auto" ? "自动" : agent;
	ctx.emit({
		type: "progress",
		message: `正在运行本地 Agent（${agentLabel}）`,
	});

	const result = await executeAgent(
		{
			brief,
			contextSnapshot: formatContextSummary(ctx.liveContext),
			cwd,
			agent,
			maxTurns: typeof args.maxTurns === "number" ? args.maxTurns : 10,
			timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : 180_000,
			allowEdits,
			onEvent: (taskEvent) =>
				ctx.emit({ type: "progress", message: taskEvent.message, taskEvent }),
		},
		failedSteps,
	);
	if (!result.ok) {
		throw new Error(result.summary || result.stderr || "本地 Agent 执行失败");
	}
	return result;
}
