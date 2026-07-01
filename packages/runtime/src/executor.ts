import type { ActionPlan, ActionStep } from "@fold/ai";
import { connectorLabel, resolveMailConnector } from "@fold/connectors";
import { executeSkill, type SkillContext } from "@fold/skills";
import { labelForSkill } from "./step-labels.js";
import type { StepResult, StateEmitter, StepView } from "./types.js";

export interface StepFailure extends StepResult {
	status: "failed";
	retryable: boolean;
}

function stepViews(
	plan: ActionPlan,
	results: StepResult[],
	runningId?: string,
): StepView[] {
	return plan.steps.map((s) => ({
		id: s.id,
		label: labelForSkill(s.skill),
		status:
			s.id === runningId
				? "running"
				: results.find((r) => r.stepId === s.id)?.status === "success"
					? "done"
					: results.find((r) => r.stepId === s.id)?.status === "failed"
						? "failed"
						: "pending",
	}));
}

function buildDependencyGraph(steps: ActionStep[]): ActionStep[][] {
	const done = new Set<string>();
	const remaining = [...steps];
	const batches: ActionStep[][] = [];

	while (remaining.length) {
		const batch = remaining.filter(
			(s) => !s.dependsOn?.length || s.dependsOn.every((d) => done.has(d)),
		);
		if (!batch.length) break;
		for (const s of batch) {
			done.add(s.id);
			const idx = remaining.indexOf(s);
			if (idx >= 0) remaining.splice(idx, 1);
		}
		batches.push(batch);
	}
	return batches;
}

export async function runPlan(
	plan: ActionPlan,
	ctx: SkillContext,
	emit: StateEmitter,
): Promise<{ steps: StepResult[]; failures: StepFailure[] }> {
	const results: StepResult[] = [];
	const outputs = new Map<string, unknown>();
	const batches = buildDependencyGraph(plan.steps);

	emit({
		status: "working",
		steps: stepViews(plan, results),
	});

	for (const batch of batches) {
		const batchResults = await Promise.all(
			batch.map(async (step) => {
				emit({
					status: "working",
					steps: stepViews(plan, results, step.id),
					currentApp: step.skill.startsWith("mail")
						? connectorLabel(
								resolveMailConnector(undefined, {
									activeApp: ctx.liveContext.activeApp,
									activeWindow: ctx.liveContext.activeWindow,
									recentUrls: ctx.liveContext.recentUrls,
								}),
							)
						: step.skill.startsWith("pdf")
							? "PDF"
							: step.skill.startsWith("os")
								? "Terminal"
								: null,
				});

				const start = Date.now();
				try {
					const skillCtx: SkillContext = {
						...ctx,
						previousResults: outputs,
						emit: (e) => {
							if (e.type === "progress") {
								emit({
									status: "working",
									progressMessage: e.message,
									steps: stepViews(plan, results, step.id),
								});
							}
						},
					};
					const output = await executeSkill(step.skill, step.args, skillCtx);
					outputs.set(step.id, output);
					const result: StepResult = {
						stepId: step.id,
						skill: step.skill,
						status: "success",
						output,
						durationMs: Date.now() - start,
					};
					results.push(result);
					return result;
				} catch (e) {
					const result: StepFailure = {
						stepId: step.id,
						skill: step.skill,
						status: "failed",
						durationMs: Date.now() - start,
						error: (e as Error).message,
						retryable: step.retryable,
					};
					results.push(result);
					return result;
				}
			}),
		);

		const criticalFail = batchResults.find(
			(r) => r.status === "failed" && !plan.steps.find((s) => s.id === r.stepId)?.retryable,
		);
		if (criticalFail) break;
	}

	emit({
		status: "working",
		steps: stepViews(plan, results),
	});

	return {
		steps: results,
		failures: results.filter((r): r is StepFailure => r.status === "failed"),
	};
}

/** Retry failed steps marked retryable once (Claude Code-style fail-soft boundary). */
export async function retryFailedSteps(
	plan: ActionPlan,
	ctx: SkillContext,
	emit: StateEmitter,
	existing: StepResult[],
): Promise<StepResult[]> {
	const outputs = new Map<string, unknown>();
	for (const result of existing) {
		if (result.status === "success") outputs.set(result.stepId, result.output);
	}

	const updated = [...existing];
	for (let i = 0; i < updated.length; i++) {
		const result = updated[i]!;
		if (result.status !== "failed") continue;
		const failure = result as StepFailure;
		if (!failure.retryable) continue;
		const step = plan.steps.find((s) => s.id === result.stepId);
		if (!step) continue;

		emit({
			status: "working",
			steps: stepViews(plan, updated, step.id),
		});

		const start = Date.now();
		try {
			const skillCtx: SkillContext = {
				...ctx,
				previousResults: outputs,
				emit: (e) => {
					if (e.type === "progress") {
						emit({
							status: "working",
							progressMessage: e.message,
							steps: stepViews(plan, updated, step.id),
						});
					}
				},
			};
			const output = await executeSkill(step.skill, step.args, skillCtx);
			outputs.set(step.id, output);
			updated[i] = {
				stepId: step.id,
				skill: step.skill,
				status: "success",
				output,
				durationMs: Date.now() - start,
			};
		} catch (e) {
			updated[i] = {
				...result,
				durationMs: Date.now() - start,
				error: (e as Error).message,
			};
		}
	}

	return updated;
}
