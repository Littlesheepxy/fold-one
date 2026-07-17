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
	const baseEnvelope = ctx.agentTaskEnvelope;
	const envelope = baseEnvelope
		? {
				...baseEnvelope,
				goal: brief,
				currentState: failedSteps.length ? "recovering_after_failed_plan" : baseEnvelope.currentState,
				previousAttempts: [
					...baseEnvelope.previousAttempts,
					...failedSteps.map((error, index) => ({
						step: `failed-step-${index + 1}`,
						error,
					})),
				],
			}
		: undefined;

	const agentLabel = agent === "auto" ? "自动" : agent;
	ctx.emit({
		type: "progress",
		message: `正在运行本地 Agent（${agentLabel}）`,
	});

	const result = await executeAgent(
		{
			taskId: envelope?.runId,
			brief,
			contextSnapshot: ctx.contextSnapshot?.trim() || formatContextSummary(ctx.liveContext),
			envelope,
			cwd,
			agent,
			maxTurns: typeof args.maxTurns === "number" ? args.maxTurns : 10,
			timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : 180_000,
			allowEdits,
			signal: ctx.signal,
			onEvent: (taskEvent) =>
				ctx.emit({ type: "progress", message: taskEvent.message, taskEvent }),
		},
		failedSteps,
	);
	if (!result.ok) {
		const error = new Error(result.summary || result.stderr || "本地 Agent 执行失败") as Error & {
			stepOutput?: unknown;
		};
		// Preserve the worker envelope/session even on failure so the harness can
		// checkpoint it and resume the same thread during repair.
		error.stepOutput = result;
		throw error;
	}
	return result;
}
