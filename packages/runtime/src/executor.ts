import type { ActionPlan, ActionStep } from "@fold/ai";
import { connectorLabel, resolveMailConnector } from "@fold/connectors";
import { executeSkill, type SkillContext } from "@fold/skills";
import { labelForStep } from "./step-labels.js";
import type { StepResult, StateEmitter, StepView } from "./types.js";

export interface StepFailure extends StepResult {
	status: "failed";
	retryable: boolean;
}

export type ExecutorCheckpointPhase =
	| "step_started"
	| "step_completed"
	| "step_failed"
	| "step_skipped";

export interface ExecutorCheckpoint {
	phase: ExecutorCheckpointPhase;
	stepId: string;
	skill: string;
	status: "running" | "success" | "failed" | "skipped";
	durationMs?: number;
	error?: string;
	output?: unknown;
}

export interface RunPlanOptions {
	signal?: AbortSignal;
	onCheckpoint?: (checkpoint: ExecutorCheckpoint) => void;
}

export class TaskCanceledError extends Error {
	constructor() {
		super("Task canceled");
		this.name = "TaskCanceledError";
	}
}

export function throwIfTaskCanceled(signal?: AbortSignal): void {
	if (signal?.aborted) throw new TaskCanceledError();
}

function stepOutputFromError(error: unknown): unknown {
	if (!error || typeof error !== "object") return undefined;
	return (error as { stepOutput?: unknown }).stepOutput;
}

function resumableAgentSession(output: unknown): string | undefined {
	if (!output || typeof output !== "object") return undefined;
	const record = output as Record<string, unknown>;
	if (typeof record.sessionId === "string" && record.sessionId) return record.sessionId;
	const handoff = record.handoff;
	if (!handoff || typeof handoff !== "object") return undefined;
	const sessionId = (handoff as Record<string, unknown>).sessionId;
	return typeof sessionId === "string" && sessionId ? sessionId : undefined;
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
	options: RunPlanOptions = {},
): Promise<{ steps: StepResult[]; failures: StepFailure[] }> {
	const results: StepResult[] = [];
	const outputs = new Map<string, unknown>();
	const batches = buildDependencyGraph(plan.steps);

	emit({
		status: "working",
		steps: stepViews(plan, results),
	});

	for (const batch of batches) {
		throwIfTaskCanceled(options.signal);
		const batchResults = await Promise.all(
			batch.map(async (step) => {
				throwIfTaskCanceled(options.signal);
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
					options.onCheckpoint?.({
						phase: "step_skipped",
						stepId: step.id,
						skill: step.skill,
						status: "skipped",
						error: result.error,
						durationMs: 0,
					});
					return result;
				}
				options.onCheckpoint?.({
					phase: "step_started",
					stepId: step.id,
					skill: step.skill,
					status: "running",
				});
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
									localTaskEvent: e.taskEvent,
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
					options.onCheckpoint?.({
						phase: "step_completed",
						stepId: step.id,
						skill: step.skill,
						status: "success",
						durationMs: result.durationMs,
						output,
					});
					return result;
				} catch (e) {
					if (options.signal?.aborted || e instanceof TaskCanceledError) {
						throw new TaskCanceledError();
					}
					const result: StepFailure = {
						stepId: step.id,
						skill: step.skill,
						status: "failed",
						durationMs: Date.now() - start,
						error: (e as Error).message,
						retryable: step.retryable,
						output: stepOutputFromError(e),
					};
					results.push(result);
					options.onCheckpoint?.({
						phase: "step_failed",
						stepId: step.id,
						skill: step.skill,
						status: "failed",
						durationMs: result.durationMs,
						error: result.error,
						output: result.output,
					});
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
	options: RunPlanOptions = {},
): Promise<StepResult[]> {
	const outputs = new Map<string, unknown>();
	for (const result of existing) {
		if (result.status === "success") outputs.set(result.stepId, result.output);
		if (result.skill === "agent.execute") {
			const resumeSessionId = resumableAgentSession(result.output);
			if (resumeSessionId && ctx.agentTaskEnvelope) {
				ctx.agentTaskEnvelope = { ...ctx.agentTaskEnvelope, resumeSessionId };
			}
		}
	}

	const updated = [...existing];
	for (let i = 0; i < updated.length; i++) {
		throwIfTaskCanceled(options.signal);
		const result = updated[i]!;
		if (result.status !== "failed") continue;
		const failure = result as StepFailure;
		if (!failure.retryable) continue;
		const step = plan.steps.find((s) => s.id === result.stepId);
		if (!step) continue;
		const resumeSessionId =
			step.skill === "agent.execute" ? resumableAgentSession(result.output) : undefined;
		if (resumeSessionId && ctx.agentTaskEnvelope) {
			ctx.agentTaskEnvelope = { ...ctx.agentTaskEnvelope, resumeSessionId };
		}
		options.onCheckpoint?.({
			phase: "step_started",
			stepId: step.id,
			skill: step.skill,
			status: "running",
		});

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
			options.onCheckpoint?.({
				phase: "step_completed",
				stepId: step.id,
				skill: step.skill,
				status: "success",
				durationMs: updated[i]!.durationMs,
				output,
			});
		} catch (e) {
			if (options.signal?.aborted || e instanceof TaskCanceledError) {
				throw new TaskCanceledError();
			}
			updated[i] = {
				...result,
				durationMs: Date.now() - start,
				error: (e as Error).message,
				output: stepOutputFromError(e) ?? result.output,
			};
			options.onCheckpoint?.({
				phase: "step_failed",
				stepId: step.id,
				skill: step.skill,
				status: "failed",
				durationMs: updated[i]!.durationMs,
				error: updated[i]!.error,
				output: updated[i]!.output,
			});
		}
	}

	return updated;
}
