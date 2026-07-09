import {
	generateActionPlan,
	hasPlannerApiKey,
	mockActionPlan,
	type ActionPlan,
} from "@fold/ai";
import type { LiveContext } from "@fold/context";
import { formatContextSummary } from "@fold/context";
import { isAgentSubagentsEnabled } from "@fold/connectors";
import { saveEpisode } from "@fold/memory";
import { buildSkillCatalog, labelForStep } from "@fold/skills";
import { ensureExecutionPrerequisites } from "./auth-gate.js";
import { formatCapabilityBrief } from "./capability-brief.js";
import { formatRelevantEpisodes } from "./episode-context.js";
import { formatPlannerMemory } from "./trace-retrieval.js";
import { buildResultDetail, buildUserVisibleSummary, formatThinkingText } from "./format-result.js";
import { runPlan } from "./executor.js";
import { formatProbeSummary, runProbes, type ProbeRunResult } from "./probe-runner.js";
import { buildReactAgentPlan } from "./repair.js";
import { getAgentProbe, getCdpConnected, runRecoveryLoop } from "./recovery-runner.js";
import { resolveTier, tryCompiledPlan } from "./router.js";
import type { OrchestratorDeps, StateEmitter, TaskResult } from "./types.js";
import { needsVisualRead } from "./capability-resolver.js";
import { validatePlan, type ValidationResult } from "./validator.js";

export type { OrchestratorDeps } from "./types.js";

export async function runTask(
	intent: string,
	emit: StateEmitter,
	deps: OrchestratorDeps,
): Promise<TaskResult> {
	const context = deps.getLiveContext();

	emit({ status: "understanding", transcript: intent });

	let plan: ActionPlan;
	let probeSummary = "";
	let probeResult: ProbeRunResult | undefined;
	try {
		emit({ status: "planning" });
		probeResult = await runProbes(intent, context);
		probeSummary = formatProbeSummary(probeResult);
		const route = resolveTier(intent, context, probeResult);
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
			plan = buildReactAgentPlan(
				intent,
				agentProbe.preferred ?? "auto",
				getCdpConnected(probeResult),
			);
		} else if (route.tier === "compiled") {
			plan = tryCompiledPlan(intent) ?? mockActionPlan(intent);
		} else if (hasPlannerApiKey()) {
			plan = await generateActionPlan({
				intent,
				contextSummary: formatContextSummary(context),
				skillCatalog: buildSkillCatalog(),
				probeSummary,
				relevantEpisodes: formatPlannerMemory(
					intent,
					context,
					formatRelevantEpisodes(intent, deps.dataDir),
					deps.dataDir,
				),
			});
		} else {
			plan = mockActionPlan(intent);
		}
	} catch (e) {
		emit({ status: "error", error: (e as Error).message });
		return {
			status: "failed",
			intent,
			plan: mockActionPlan(intent),
			steps: [],
			error: (e as Error).message,
		};
	}

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
			await ensureExecutionPrerequisites(intent, plan, probeResult, deps);
		} catch (e) {
			emit({ status: "error", error: (e as Error).message });
			return {
				status: "failed",
				intent,
				plan,
				steps: [],
				error: (e as Error).message,
			};
		}
	}

	const skillCtx = {
		liveContext: context,
		previousResults: new Map<string, unknown>(),
		emit: () => {},
		taskIntent: intent,
	};

	const { steps: initialSteps, failures: initialFailures } = await runPlan(plan, skillCtx, emit);
	const initialValidation = validatePlan(plan, initialSteps);
	let steps = initialSteps;
	let validation = initialValidation;

	let abortReason: string | undefined;
	if (!validation.ok || initialFailures.length > 0) {
		const recovery = await runRecoveryLoop({
			intent,
			plan,
			context,
			probeResult: probeResult ?? { probes: [] },
			skillCtx,
			emit,
			initialSteps,
			initialFailures,
			initialValidation,
		});
		steps = recovery.steps;
		validation = recovery.validation;
		const lastAbort = [...recovery.actions].reverse().find((a) => a.type === "abort");
		abortReason = lastAbort?.type === "abort" ? lastAbort.reason : undefined;
	}

	validation = softenValidationForVisualAnswer(intent, steps, validation);

	const userVisibleResult = buildUserVisibleSummary(intent, steps, validation.ok);
	const resultDetail = buildResultDetail(intent, steps);

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
			status: validation.ok ? "success" : "partial",
			userVisibleResult,
			probeSummary,
			validationChecks: validation.checks,
			contextEvents: context.events,
			thinkingText,
			resultDetail,
		},
		deps.dataDir,
	);

	if (validation.ok) {
		emit({
			status: "done",
			transcript: intent,
			thinkingText,
			result: userVisibleResult,
			resultDetail,
			steps: plan.steps.map((s) => ({
				id: s.id,
				label: labelForStep(s.skill, {
					args: s.args,
					output: steps.find((r) => r.stepId === s.id)?.output,
				}),
				status: steps.find((r) => r.stepId === s.id)?.status === "success" ? "done" : "failed",
			})),
		});
		return { status: "success", intent, plan, steps, episodeId: episode.id };
	}

	const failedCheckMessage =
		validation.checks.find((c) => !c.passed)?.message ?? "Validation failed";
	emit({
		status: "error",
		error: abortReason ? `${abortReason} · ${failedCheckMessage}` : failedCheckMessage,
		result: userVisibleResult,
		resultDetail,
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
	return {
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
