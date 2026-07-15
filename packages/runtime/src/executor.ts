import type { ActionPlan, ActionStep } from "@fold/ai";
import { connectorLabel, resolveMailConnector } from "@fold/connectors";
import { executeSkill, type SkillContext } from "@fold/skills";
import { labelForStep } from "./step-labels.js";
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
		label: labelForStep(s.skill, { args: s.args }),
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

const STEP_TEMPLATE_RE = /\{\{\s*steps\.([\w-]+)\.([\w.-]+)\s*\}\}/g;
const WHOLE_TEMPLATE_RE = /^\{\{\s*steps\.([\w-]+)\.([\w.-]+)\s*\}\}$/;

/** 沿 path 取值；遇到 JSON 字符串（如 CLI stdout）自动解析后继续下钻。 */
function resolveStepPath(output: unknown, path: string): unknown {
	let cur: unknown = output;
	const segs = path.split(".");
	for (let i = 0; i < segs.length; i++) {
		const seg = segs[i]!;
		if (i === 0 && (seg === "output" || seg === "result")) continue;
		if (typeof cur === "string") {
			try {
				cur = JSON.parse(cur);
			} catch {
				return undefined;
			}
		}
		if (cur == null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[seg];
	}
	return cur;
}

function renderResolved(resolved: unknown): string {
	return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
}

/** 把 args 里的 {{steps.<id>.<path>}} 替换为前序步骤的输出。 */
export function interpolateStepArgs(value: unknown, outputs: Map<string, unknown>): unknown {
	if (typeof value === "string") {
		const whole = value.match(WHOLE_TEMPLATE_RE);
		if (whole) {
			const resolved = resolveStepPath(outputs.get(whole[1]!), whole[2]!);
			return resolved === undefined ? value : renderResolved(resolved);
		}
		return value.replace(STEP_TEMPLATE_RE, (raw, id: string, path: string) => {
			const resolved = resolveStepPath(outputs.get(id), path);
			return resolved === undefined ? raw : renderResolved(resolved);
		});
	}
	if (Array.isArray(value)) return value.map((v) => interpolateStepArgs(v, outputs));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, interpolateStepArgs(v, outputs)]),
		);
	}
	return value;
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
				// 依赖步骤失败时不再带着坏参数往下跑
				const failedDep = step.dependsOn?.find(
					(d) => results.find((r) => r.stepId === d)?.status === "failed",
				);
				if (failedDep) {
					const result: StepFailure = {
						stepId: step.id,
						skill: step.skill,
						status: "failed",
						durationMs: 0,
						error: `依赖步骤 ${failedDep} 失败，已跳过`,
						retryable: false,
					};
					results.push(result);
					return result;
				}
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
					const args = interpolateStepArgs(step.args, outputs) as Record<string, unknown>;
					const output = await executeSkill(step.skill, args, skillCtx);
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
			const args = interpolateStepArgs(step.args, outputs) as Record<string, unknown>;
			const output = await executeSkill(step.skill, args, skillCtx);
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
