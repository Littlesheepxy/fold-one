import {
	generateActionPlan,
	hasPlannerApiKey,
	mockActionPlan,
	type ActionPlan,
} from "@fold/ai";
import type { LiveContext } from "@fold/context";
import {
	isAgentSubagentsEnabled,
	type AgentTaskEnvelope,
	type LocalTaskArtifact,
	type LocalTaskEvent,
	type MemoryCandidate,
} from "@fold/connectors";
import {
	appendRunEvent,
	getSideEffectReceipt,
	promoteRecipe,
	recordRecipeOutcome,
	saveEpisode,
	saveTaskCheckpoint,
	startTaskRun,
	updateTaskRun,
	upsertSideEffectReceipt,
	type RunEventType,
} from "@fold/memory";
import { buildSkillCatalog, labelForStep, type SkillContext } from "@fold/skills";
import { ensureExecutionPrerequisites } from "./auth-gate.js";
import { formatCapabilityBrief } from "./capability-brief.js";
import {
	assembleTaskContext,
	type AssembledTaskContext,
} from "./context-assembler.js";
import { buildResultDetail, buildUserVisibleSummary, formatThinkingText } from "./format-result.js";
import {
	runPlan,
	TaskCanceledError,
	throwIfTaskCanceled,
	type ExecutorCheckpoint,
	type RunPlanOptions,
} from "./executor.js";
import { formatProbeSummary, runProbes, type ProbeRunResult } from "./probe-runner.js";
import { buildReactAgentPlan } from "./repair.js";
import { getAgentProbe, getCdpConnected, runRecoveryLoop } from "./recovery-runner.js";
import { resolveTier, tryCompiledPlan } from "./router.js";
import type { OrchestratorDeps, StateEmitter, TaskResult } from "./types.js";
import { needsVisualRead } from "./capability-resolver.js";
import { validatePlan, type ValidationResult } from "./validator.js";
import { createTaskMoment, type TaskMoment } from "./task-moment.js";

export type { OrchestratorDeps } from "./types.js";

function recordRunEvent(
	runId: string,
	type: RunEventType,
	payload: Record<string, unknown>,
	dataDir?: string,
): void {
	try {
		appendRunEvent({ runId, type, payload }, dataDir);
	} catch {
		// Event persistence is diagnostic/durable state and must not break the live fast path.
	}
}

function collectLocalTaskEvidence(steps: Array<{ output?: unknown }>): {
	agentEvents: LocalTaskEvent[];
	artifacts: LocalTaskArtifact[];
	memoryCandidates: MemoryCandidate[];
} {
	const agentEvents: LocalTaskEvent[] = [];
	const artifacts: LocalTaskArtifact[] = [];
	const memoryCandidates: MemoryCandidate[] = [];
	for (const step of steps) {
		if (!step.output || typeof step.output !== "object") continue;
		const output = step.output as Record<string, unknown>;
		if (Array.isArray(output.events)) agentEvents.push(...(output.events as LocalTaskEvent[]));
		if (Array.isArray(output.artifacts)) artifacts.push(...(output.artifacts as LocalTaskArtifact[]));
		if (Array.isArray(output.memoryCandidates)) {
			memoryCandidates.push(...(output.memoryCandidates as MemoryCandidate[]));
		}
	}
	return { agentEvents, artifacts, memoryCandidates };
}

function findAgentSessionId(steps: Array<{ output?: unknown }>): string | undefined {
	for (let i = steps.length - 1; i >= 0; i -= 1) {
		const output = steps[i]?.output;
		if (!output || typeof output !== "object") continue;
		const record = output as Record<string, unknown>;
		if (typeof record.sessionId === "string" && record.sessionId) return record.sessionId;
		const handoff = record.handoff;
		if (handoff && typeof handoff === "object") {
			const sessionId = (handoff as Record<string, unknown>).sessionId;
			if (typeof sessionId === "string" && sessionId) return sessionId;
		}
	}
	return undefined;
}

function buildAgentTaskEnvelope(
	intent: string,
	plan: ActionPlan,
	moment: TaskMoment,
	assembled?: AssembledTaskContext,
): AgentTaskEnvelope {
	return {
		runId: moment.taskId,
		goal: intent,
		currentState: "ready_to_execute",
		context: {
			workingContext: assembled?.contextSummary,
			taskMoment: moment,
		},
		relevantMemories: assembled?.memoryBrief ? [assembled.memoryBrief] : [],
		previousAttempts: [],
		availableCapabilities: [...new Set(plan.steps.map((step) => step.skill))],
		constraints: [
			"Do not repeat a side effect when evidence shows it already succeeded.",
			"Do not expose secrets, credentials, tokens, or unrelated private content.",
			"Prefer the smallest change or action that satisfies the user intent.",
		],
		acceptanceCriteria: [
			...plan.validate,
			"Return concrete evidence for every claimed side effect.",
		],
		idempotencyKey: `fold:${moment.taskId}`,
	};
}

export async function runTask(
	intent: string,
	emit: StateEmitter,
	deps: OrchestratorDeps,
): Promise<TaskResult> {
	const context = deps.getLiveContext();
	let taskMoment = createTaskMoment(intent, context);
	startTaskRun(
		{ id: taskMoment.taskId, intent, taskMoment, phase: "understanding" },
		deps.dataDir,
	);

	emit({ status: "understanding", transcript: intent });

	let plan: ActionPlan;
	let recipeId: string | undefined;
	let probeSummary = "";
	let probeResult: ProbeRunResult | undefined;
	let plannerContextSummary: string | undefined;
	let assembledContext: AssembledTaskContext | undefined;
	try {
		updateTaskRun(taskMoment.taskId, { phase: "planning" }, deps.dataDir);
		emit({ status: "planning" });
		throwIfTaskCanceled(deps.signal);
		probeResult = await runProbes(intent, context, deps.dataDir);
		throwIfTaskCanceled(deps.signal);
		probeSummary = formatProbeSummary(probeResult);
		const route = resolveTier(intent, context, probeResult, deps.dataDir);
		if (route.tier === "react") {
			if (!isAgentSubagentsEnabled()) {
				throw new Error(
					`此任务需要 Tier 2 本地 Agent（${route.reason}）。请在设置中开启「允许本地 Agent Subagent」。`,
				);
			}
			const agentProbe = getAgentProbe(probeResult);
			if (agentProbe.agents.length === 0) {
				throw new Error(
					`此任务需要 Tier 2，但未检测到可用的本地 Agent CLI（claude / codex / agent）。`,
				);
			}
			assembledContext = await assembleTaskContext(
				intent,
				context,
				deps.dataDir,
				taskMoment.taskId,
				{
					captureTaskMomentScreenshot: deps.captureTaskMomentScreenshot,
					ocrImageFile: deps.ocrImageFile,
				},
			);
			taskMoment = assembledContext.moment;
			plannerContextSummary = assembledContext.agentContext;
			plan = buildReactAgentPlan(
				intent,
				agentProbe.preferred ?? "auto",
				getCdpConnected(probeResult),
				deps.agentCwd,
			);
		} else if (route.tier === "compiled") {
			const compiled = tryCompiledPlan(intent, deps.dataDir);
			plan = compiled?.plan ?? mockActionPlan(intent);
			recipeId = compiled?.recipeId;
		} else if (hasPlannerApiKey()) {
			assembledContext = await assembleTaskContext(
				intent,
				context,
				deps.dataDir,
				taskMoment.taskId,
				{
					captureTaskMomentScreenshot: deps.captureTaskMomentScreenshot,
					ocrImageFile: deps.ocrImageFile,
				},
			);
			taskMoment = assembledContext.moment;
			plannerContextSummary = assembledContext.agentContext;
			plan = await generateActionPlan({
				intent,
				contextSummary: assembledContext.contextSummary,
				skillCatalog: buildSkillCatalog(),
				probeSummary,
				relevantEpisodes: assembledContext.memoryBrief,
			});
		} else {
			plan = mockActionPlan(intent);
		}
	} catch (e) {
		const canceled = deps.signal?.aborted || e instanceof TaskCanceledError;
		const error = canceled ? "任务已取消" : (e as Error).message;
		updateTaskRun(
			taskMoment.taskId,
			{
				status: canceled ? "canceled" : "failed",
				phase: canceled ? "canceled" : "planning_failed",
				error,
				completedAt: Date.now(),
			},
			deps.dataDir,
		);
		recordRunEvent(taskMoment.taskId, canceled ? "run.canceled" : "run.completed", {
			status: canceled ? "canceled" : "failed", error,
		}, deps.dataDir);
		emit({ status: "error", error });
		return {
			runId: taskMoment.taskId,
			status: canceled ? "canceled" : "failed",
			intent,
			plan: mockActionPlan(intent),
			steps: [],
			error,
		};
	}
	updateTaskRun(
		taskMoment.taskId,
		{ phase: "planned", plan, taskMoment },
		deps.dataDir,
	);
	recordRunEvent(taskMoment.taskId, "plan.created", { plan }, deps.dataDir);

	const capabilityBrief = probeResult
		? formatCapabilityBrief(intent, plan, probeResult)
		: "";
	const thinkingText = [formatThinkingText(intent, plan, probeSummary), capabilityBrief]
		.filter(Boolean)
		.join("\n\n");
	emit({
		status: "planning",
		transcript: intent,
		thinkingText,
		steps: plan.steps.map((s) => ({
			id: s.id,
			label: labelForStep(s.skill, { args: s.args }),
			status: "pending",
		})),
	});

	if (probeResult) {
		try {
			throwIfTaskCanceled(deps.signal);
			await ensureExecutionPrerequisites(intent, plan, probeResult, deps);
			throwIfTaskCanceled(deps.signal);
		} catch (e) {
			const canceled = deps.signal?.aborted || e instanceof TaskCanceledError;
			const error = canceled ? "任务已取消" : (e as Error).message;
			updateTaskRun(
				taskMoment.taskId,
				{
					status: canceled ? "canceled" : "failed",
					phase: canceled ? "canceled" : "prerequisite_failed",
					error,
					completedAt: Date.now(),
				},
				deps.dataDir,
			);
			recordRunEvent(taskMoment.taskId, canceled ? "run.canceled" : "run.completed", {
				status: canceled ? "canceled" : "failed", error,
			}, deps.dataDir);
			emit({ status: "error", error });
			return {
				runId: taskMoment.taskId,
				status: canceled ? "canceled" : "failed",
				intent,
				plan,
				steps: [],
				error,
			};
		}
	}

	const skillCtx: SkillContext = {
		liveContext: context,
		previousResults: new Map<string, unknown>(),
		emit: () => {},
		taskIntent: intent,
		contextSnapshot: plannerContextSummary,
		agentTaskEnvelope: buildAgentTaskEnvelope(intent, plan, taskMoment, assembledContext),
		signal: deps.signal,
		lookupSideEffectReceipt: (idempotencyKey) => getSideEffectReceipt(idempotencyKey, deps.dataDir),
		recordSideEffectRequest: (input) => {
			upsertSideEffectReceipt({
				runId: taskMoment.taskId,
				...input,
				status: "requested",
			}, deps.dataDir);
			recordRunEvent(taskMoment.taskId, "action.requested", input, deps.dataDir);
		},
	};
	const executionOptions: RunPlanOptions = {
		signal: deps.signal,
		onCheckpoint: (checkpoint: ExecutorCheckpoint) => {
			try {
				saveTaskCheckpoint(
					{
						runId: taskMoment.taskId,
						phase: checkpoint.phase,
						stepId: checkpoint.stepId,
						skill: checkpoint.skill,
						status: checkpoint.status,
						payload: {
							durationMs: checkpoint.durationMs,
							error: checkpoint.error,
							output: checkpoint.output,
						},
					},
					deps.dataDir,
				);
				const output = checkpoint.output as Record<string, unknown> | undefined;
				if (checkpoint.phase === "step_completed" || checkpoint.phase === "step_failed") {
					recordRunEvent(taskMoment.taskId, "action.observed", {
						stepId: checkpoint.stepId,
						skill: checkpoint.skill,
						ok: checkpoint.phase === "step_completed",
						error: checkpoint.error,
						externalRef: output?.externalRef,
						idempotencyKey: output?.idempotencyKey,
					}, deps.dataDir);
				}
				if (
					(checkpoint.phase === "step_completed" || checkpoint.phase === "step_failed") &&
					typeof output?.idempotencyKey === "string" &&
					typeof output.inputHash === "string"
				) {
					upsertSideEffectReceipt({
						runId: taskMoment.taskId,
						idempotencyKey: output.idempotencyKey,
						connector: String(output.channel ?? checkpoint.skill),
						operation: String(output.operation ?? "execute"),
						targetFingerprint: String(output.targetFingerprint ?? "unknown"),
						inputHash: output.inputHash,
						status:
							checkpoint.phase === "step_completed" && output.receiptStatus !== "uncertain"
								? "confirmed"
								: "uncertain",
						externalRef: typeof output.externalRef === "string" ? output.externalRef : undefined,
						verification: output,
					}, deps.dataDir);
				}
			} catch {
				// A non-serializable skill result must not stop the user task.
			}
		},
	};

	let steps;
	let validation;
	let neededRecovery = false;
	let abortReason: string | undefined;
	try {
		updateTaskRun(taskMoment.taskId, { phase: "executing" }, deps.dataDir);
		const firstRun = await runPlan(plan, skillCtx, emit, executionOptions);
		let recoverySteps = firstRun.steps;
		let recoveryFailures = firstRun.failures;
		let recoveryValidation = validatePlan(plan, recoverySteps);
		steps = recoverySteps;
		validation = recoveryValidation;
		neededRecovery = !recoveryValidation.ok || recoveryFailures.length > 0;

		// Recipe miss-fire: demote and fall back to planner once before generic recovery.
		if (recipeId && neededRecovery) {
			recordRecipeOutcome(recipeId, false, deps.dataDir);
			recipeId = undefined;
			if (!assembledContext) {
				try {
					assembledContext = await assembleTaskContext(
						intent,
						context,
						deps.dataDir,
						taskMoment.taskId,
					);
					taskMoment = assembledContext.moment;
					skillCtx.contextSnapshot = assembledContext.agentContext;
				} catch {
					/* proceed with L1 moment */
				}
			}
			if (hasPlannerApiKey() && assembledContext) {
				plan = await generateActionPlan({
					intent,
					contextSummary: assembledContext.contextSummary,
					skillCatalog: buildSkillCatalog(),
					probeSummary,
					relevantEpisodes: assembledContext.memoryBrief,
				});
			} else {
				plan = mockActionPlan(intent);
			}
			skillCtx.agentTaskEnvelope = buildAgentTaskEnvelope(
				intent,
				plan,
				taskMoment,
				assembledContext,
			);
			updateTaskRun(taskMoment.taskId, { phase: "recovering", plan, taskMoment }, deps.dataDir);
			recordRunEvent(
				taskMoment.taskId,
				"plan.created",
				{ plan, source: "recipe_fallback" },
				deps.dataDir,
			);
			const fallback = await runPlan(plan, skillCtx, emit, executionOptions);
			recoverySteps = fallback.steps;
			recoveryFailures = fallback.failures;
			recoveryValidation = validatePlan(plan, recoverySteps);
			steps = recoverySteps;
			validation = recoveryValidation;
			neededRecovery = !recoveryValidation.ok || recoveryFailures.length > 0;
		}

		if (neededRecovery) {
			updateTaskRun(taskMoment.taskId, { phase: "recovering" }, deps.dataDir);
			// Keep the compiled fast path fast; only deepen AX/memory context after it actually fails.
			if (!assembledContext) {
				try {
					assembledContext = await assembleTaskContext(
						intent,
						context,
						deps.dataDir,
						taskMoment.taskId,
					);
					taskMoment = assembledContext.moment;
					skillCtx.contextSnapshot = assembledContext.agentContext;
					skillCtx.agentTaskEnvelope = buildAgentTaskEnvelope(
						intent,
						plan,
						taskMoment,
						assembledContext,
					);
					updateTaskRun(taskMoment.taskId, { taskMoment }, deps.dataDir);
				} catch {
					// Recovery can still run with the bounded L1 TaskMoment.
				}
			}
			const recovery = await runRecoveryLoop({
				intent,
				plan,
				context,
				probeResult: probeResult ?? { probes: [] },
				skillCtx,
				emit,
				initialSteps: recoverySteps,
				initialFailures: recoveryFailures,
				initialValidation: recoveryValidation,
				executionOptions,
				dataDir: deps.dataDir,
			});
			steps = recovery.steps;
			validation = recovery.validation;
			const lastAbort = [...recovery.actions].reverse().find((a) => a.type === "abort");
			abortReason = lastAbort?.type === "abort" ? lastAbort.reason : undefined;
		}
	} catch (error) {
		const canceled = deps.signal?.aborted || error instanceof TaskCanceledError;
		const message = canceled ? "任务已取消" : (error as Error).message;
		updateTaskRun(
			taskMoment.taskId,
			{
				status: canceled ? "canceled" : "failed",
				phase: canceled ? "canceled" : "execution_failed",
				error: message,
				completedAt: Date.now(),
			},
			deps.dataDir,
		);
		recordRunEvent(taskMoment.taskId, canceled ? "run.canceled" : "run.completed", {
			status: canceled ? "canceled" : "failed", error: message,
		}, deps.dataDir);
		emit({ status: "error", error: message });
		return {
			runId: taskMoment.taskId,
			status: canceled ? "canceled" : "failed",
			intent,
			plan,
			steps: [],
			error: message,
		};
	}

	validation = softenValidationForVisualAnswer(intent, steps, validation);

	const recovered = neededRecovery && validation.ok;
	const baseUserVisibleResult = buildUserVisibleSummary(intent, steps, validation.ok);
	const userVisibleResult = recovered
		? `恢复完成 · ${baseUserVisibleResult.split("\n")[0]?.slice(0, 200) || intent}`
		: baseUserVisibleResult;
	const baseResultDetail = buildResultDetail(intent, steps);
	const resultDetail = recovered
		? `• 执行路径：主路径失败，已通过恢复路径完成\n${baseResultDetail}`
		: baseResultDetail;
	const localTaskEvidence = collectLocalTaskEvidence(steps);
	const agentSessionId = findAgentSessionId(steps);

	const episode = saveEpisode(
		{
			intent,
			goal: plan.goal,
			plan,
			steps: steps.map((s) => ({
				stepId: s.stepId,
				skill: s.skill,
				label: labelForStep(s.skill, { output: s.output }),
				status: s.status,
				durationMs: s.durationMs,
				error: s.error,
			})),
			status: recovered ? "recovered" : validation.ok ? "success" : "partial",
			userVisibleResult,
			probeSummary,
			validationChecks: validation.checks,
			contextEvents: context.events,
			thinkingText,
			resultDetail,
			agentEvents: localTaskEvidence.agentEvents,
			artifacts: localTaskEvidence.artifacts,
			memoryCandidates: localTaskEvidence.memoryCandidates,
			taskMoment,
		},
		deps.dataDir,
	);

	if (recipeId && validation.ok) {
		recordRecipeOutcome(recipeId, true, deps.dataDir);
	}
	if (validation.ok || recovered) {
		try {
			promoteRecipe(episode, deps.dataDir);
		} catch {
			/* recipe promotion must not fail the user task */
		}
	}

	if (validation.ok) {
		updateTaskRun(
			taskMoment.taskId,
			{
				status: "success",
				phase: "completed",
				taskMoment,
				episodeId: episode.id,
				agentSessionId,
				result: { steps, validation, userVisibleResult },
				completedAt: Date.now(),
			},
			deps.dataDir,
		);
		if (agentSessionId) {
			recordRunEvent(taskMoment.taskId, "worker.session.bound", { sessionId: agentSessionId }, deps.dataDir);
		}
		recordRunEvent(taskMoment.taskId, "run.completed", {
			status: "success", episodeId: episode.id,
		}, deps.dataDir);
		emit({
			status: "done",
			transcript: intent,
			thinkingText,
			result: userVisibleResult,
			resultDetail,
			verificationChecks: validation.checks,
			steps: plan.steps.map((s) => ({
				id: s.id,
				label: labelForStep(s.skill, {
					args: s.args,
					output: steps.find((r) => r.stepId === s.id)?.output,
				}),
				status: steps.find((r) => r.stepId === s.id)?.status === "success" ? "done" : "failed",
			})),
		});
		return {
			runId: taskMoment.taskId,
			status: "success",
			intent,
			plan,
			steps,
			episodeId: episode.id,
		};
	}

	const failedCheckMessage =
		validation.checks.find((c) => !c.passed)?.message ?? "Validation failed";
	emit({
		status: "error",
		error: abortReason ? `${abortReason} · ${failedCheckMessage}` : failedCheckMessage,
		result: userVisibleResult,
		resultDetail,
		verificationChecks: validation.checks,
		thinkingText,
		steps: plan.steps.map((s) => ({
			id: s.id,
			label: labelForStep(s.skill, {
				args: s.args,
				output: steps.find((r) => r.stepId === s.id)?.output,
			}),
			status: steps.find((r) => r.stepId === s.id)?.status === "success" ? "done" : "failed",
		})),
	});
	updateTaskRun(
		taskMoment.taskId,
		{
			status: "partial",
			phase: "completed",
			taskMoment,
			episodeId: episode.id,
			agentSessionId,
			result: { steps, validation, userVisibleResult },
			error: failedCheckMessage,
			completedAt: Date.now(),
		},
		deps.dataDir,
	);
	if (agentSessionId) {
		recordRunEvent(taskMoment.taskId, "worker.session.bound", { sessionId: agentSessionId }, deps.dataDir);
	}
	recordRunEvent(taskMoment.taskId, "run.completed", {
		status: "partial", episodeId: episode.id, error: failedCheckMessage,
	}, deps.dataDir);
	return {
		runId: taskMoment.taskId,
		status: "partial",
		intent,
		plan,
		steps,
		episodeId: episode.id,
		error: "Validation failed",
	};
}

/** Mock run for UI testing without skills */
export async function runMockTask(intent: string, emit: StateEmitter): Promise<void> {
	emit({ status: "understanding", transcript: intent });
	await delay(400);
	emit({ status: "planning" });
	await delay(300);

	const mockSteps: Array<{ id: string; label: string; status: "pending" | "running" | "done" }> = [
		{ id: "1", label: "Found quote.pdf", status: "pending" },
		{ id: "2", label: "Reading PDF", status: "pending" },
		{ id: "3", label: "Creating mail draft", status: "pending" },
	];

	for (let i = 0; i < mockSteps.length; i++) {
		const step = mockSteps[i]!;
		emit({
			status: "working",
			steps: mockSteps.map((s, idx) => ({
				...s,
				status: idx < i ? "done" : idx === i ? "running" : "pending",
			})),
			currentApp: step.id === "3" ? "Mail" : null,
		});
		await delay(600);
		mockSteps[i] = { ...step, status: "done" };
	}

	emit({
		status: "done",
		result: "Mail Draft Ready · 3 fields extracted",
		steps: mockSteps.map((s) => ({ ...s, status: "done" as const })),
	});
	await delay(2000);
	emit({ status: "idle" });
}

function delay(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

/** Screenshot + OCR text is enough to answer read-screen intents even if the original plan failed. */
function softenValidationForVisualAnswer(
	intent: string,
	steps: Array<{ skill: string; status: string; output?: unknown }>,
	validation: ValidationResult,
): ValidationResult {
	if (validation.ok || !needsVisualRead(intent)) return validation;
	const shot = steps.find((s) => s.skill === "os.screenshot" && s.status === "success");
	const text = (shot?.output as { text?: string } | undefined)?.text?.trim();
	if (!text) return validation;
	return {
		ok: true,
		checks: [...validation.checks, { rule: "visual.answer", passed: true }],
	};
}
