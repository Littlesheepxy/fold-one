import { generateRecoveryPlan, hasPlannerApiKey, type ActionPlan } from "@fold/ai";
import type { AgentId, SubagentHandoff } from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import { formatContextSummary } from "@fold/context";
import { isAgentSubagentsEnabled } from "@fold/connectors";
import type { ValidationResult } from "./validator.js";
import { runPlan, retryFailedSteps, type StepFailure } from "./executor.js";
import { formatProbeSummary, type ProbeRunResult } from "./probe-runner.js";
import {
	buildRecoveryPlan,
	DEFAULT_REPAIR_BUDGET,
	handleFailure,
	resolveRepairBudget,
	type RecoveryAction,
} from "./recovery.js";
import { validatePlan } from "./validator.js";
import {
	buildSkillCatalog,
	listSkillManifests,
	listSkills,
	type SkillContext,
} from "@fold/skills";
import type { StateEmitter, StepResult } from "./types.js";

export interface RecoveryRunResult {
	steps: StepResult[];
	validation: ValidationResult;
	handoff?: SubagentHandoff;
	actions: RecoveryAction[];
}

export function getAgentProbe(probeResult: ProbeRunResult): {
	enabled: boolean;
	agents: AgentId[];
	preferred: AgentId | null;
} {
	const probe = probeResult.probes.find((p) => p.id === "agent.available");
	const value = probe?.value as
		| { enabled?: boolean; agents?: AgentId[]; preferred?: AgentId | null }
		| undefined;
	return {
		enabled: Boolean(value?.enabled),
		agents: value?.agents ?? [],
		preferred: value?.preferred ?? null,
	};
}

export function getCdpConnected(probeResult: ProbeRunResult): boolean {
	const probe = probeResult.probes.find((p) => p.id === "browser.cdp");
	const value = probe?.value as { connected?: boolean } | undefined;
	return Boolean(value?.connected);
}

export function getUitarsProbe(probeResult: ProbeRunResult): {
	enabled: boolean;
	available: boolean;
} {
	const probe = probeResult.probes.find((p) => p.id === "uitars.available");
	const value = probe?.value as { enabled?: boolean; available?: boolean } | undefined;
	return {
		enabled: Boolean(value?.enabled),
		available: Boolean(value?.available),
	};
}

export function getWorkbuddyProbe(probeResult: ProbeRunResult): {
	enabled: boolean;
	available: boolean;
} {
	const probe = probeResult.probes.find((p) => p.id === "workbuddy.available");
	const value = probe?.value as { enabled?: boolean; available?: boolean } | undefined;
	return {
		enabled: Boolean(value?.enabled),
		available: Boolean(value?.available),
	};
}

export function getScreenCaptureProbe(probeResult: ProbeRunResult): { available: boolean } {
	const probe = probeResult.probes.find((p) => p.id === "screen.capture");
	const value = probe?.value as { available?: boolean } | undefined;
	return { available: Boolean(value?.available) };
}

function screenshotSucceeded(steps: StepResult[]): boolean {
	return steps.some((s) => s.skill === "os.screenshot" && s.status === "success");
}

/**
 * 失败签名：skill + 错误前缀 + 未过的验证规则。
 * 连续两轮签名相同 = 没有新信息 = 无进展，继续重试只会烧预算。
 */
export function failureSignature(failures: StepFailure[], validation: ValidationResult): string {
	const failParts = failures
		.map((f) => `${f.skill}:${(f.error ?? "").replace(/\d+/g, "#").slice(0, 80)}`)
		.sort();
	const checkParts = validation.checks
		.filter((c) => !c.passed)
		.map((c) => c.rule)
		.sort();
	return [...failParts, ...checkParts].join("|");
}

const MAX_REPLAN_STEPS = 4;

function isValidReplan(plan: ActionPlan): boolean {
	const known = new Set(listSkills());
	return (
		plan.steps.length > 0 &&
		plan.steps.length <= MAX_REPLAN_STEPS &&
		plan.steps.every((s) => known.has(s.skill))
	);
}

interface ReplanOutcome {
	action: RecoveryAction;
	steps: StepResult[];
	failures: StepFailure[];
	validation: ValidationResult;
	handoff?: SubagentHandoff;
}

/**
 * LLM Replanner：把失败上下文回喂 planner 生成换路线的新计划并执行。
 * 任何环节失败（无效计划 / LLM 报错）都返回 null，回落到规则式 recovery。
 */
async function tryLlmReplan(
	input: {
		intent: string;
		plan: ActionPlan;
		context: LiveContext;
		probeResult: ProbeRunResult;
		skillCtx: SkillContext;
		emit: StateEmitter;
	},
	failures: StepFailure[],
	validation: ValidationResult,
): Promise<ReplanOutcome | null> {
	try {
		input.emit({ status: "planning" });
		const manifests = listSkillManifests().filter((m) => m.validators);
		const plan = await generateRecoveryPlan({
			intent: input.intent,
			contextSummary: formatContextSummary(input.context),
			skillCatalog: buildSkillCatalog(),
			probeSummary: formatProbeSummary(input.probeResult),
			failedPlanJson: JSON.stringify(input.plan),
			stepFailures: failures.map((f) => `${f.skill}: ${f.error ?? "failed"}`),
			failedChecks: validation.checks.filter((c) => !c.passed).map((c) => c.rule),
			validationRules: manifests.map(
				(m) => `${m.id}: ${Object.keys(m.validators ?? {}).join(", ")}`,
			),
		});
		if (!isValidReplan(plan)) return null;
		// 兜底：只保留计划中实际用到的 skill 自己的规则。既剔除编造的规则名
		// （validatePlan 对未知规则默认放行 → 假阳性），也剔除挂错 skill 的规则
		// （步骤根本没跑那个 skill → 必然失败 → 假阴性）。一条不剩视为无效重规划。
		const planSkills = new Set(plan.steps.map((s) => s.skill));
		const allowedRules = new Set(
			manifests
				.filter((m) => planSkills.has(m.id))
				.flatMap((m) => Object.keys(m.validators ?? {})),
		);
		plan.validate = plan.validate.filter((rule) => allowedRules.has(rule));
		if (plan.validate.length === 0) return null;

		input.emit({ status: "working" });
		const run = await runPlan(plan, input.skillCtx, input.emit);
		const agentOutput = run.steps.find((s) => s.skill === "agent.execute")?.output as
			| { handoff?: SubagentHandoff }
			| undefined;
		return {
			action: {
				type: "repair",
				backend: "replan",
				brief: `LLM replan: ${plan.goal}`,
				budget: DEFAULT_REPAIR_BUDGET,
			},
			steps: run.steps,
			failures: run.failures,
			validation: validatePlan(plan, run.steps),
			handoff: agentOutput?.handoff,
		};
	} catch {
		return null;
	}
}

function buildRecoveryContext(
	input: {
		intent: string;
		context: LiveContext;
		failures: StepFailure[];
		validationFailed: boolean;
		probeResult: ProbeRunResult;
		repairAttempts: number;
		maxRepairAttempts: number;
		screenshotSucceeded: boolean;
	},
	agentProbe: ReturnType<typeof getAgentProbe>,
	cdpConnected: boolean,
	uitarsProbe: ReturnType<typeof getUitarsProbe>,
	workbuddyProbe: ReturnType<typeof getWorkbuddyProbe>,
	screenCaptureProbe: ReturnType<typeof getScreenCaptureProbe>,
) {
	return {
		intent: input.intent,
		liveContext: input.context,
		failures: input.failures,
		validationFailed: input.validationFailed,
		agentsEnabled: isAgentSubagentsEnabled(),
		availableAgents: agentProbe.agents,
		cdpConnected,
		uitarsEnabled: uitarsProbe.enabled,
		uitarsAvailable: uitarsProbe.available,
		workbuddyAvailable: workbuddyProbe.available,
		screenCaptureAvailable: screenCaptureProbe.available,
		screenshotSucceeded: input.screenshotSucceeded,
		repairAttempts: input.repairAttempts,
		maxRepairAttempts: input.maxRepairAttempts,
	};
}

export async function runRecoveryLoop(input: {
	intent: string;
	plan: ActionPlan;
	context: LiveContext;
	probeResult: ProbeRunResult;
	skillCtx: SkillContext;
	emit: StateEmitter;
	initialSteps: StepResult[];
	initialFailures: StepFailure[];
	initialValidation: ValidationResult;
}): Promise<RecoveryRunResult> {
	const actions: RecoveryAction[] = [];
	let steps = await retryFailedSteps(input.plan, input.skillCtx, input.emit, input.initialSteps);
	let validation = validatePlan(input.plan, steps);
	let failures = steps.filter((s): s is StepFailure => s.status === "failed");
	let handoff: SubagentHandoff | undefined;
	let repairAttempts = 0;
	let lastSignature = failureSignature(failures, validation);

	// 第一优先：LLM 重规划（有 planner key 时）。失败不计入规则式预算，直接回落。
	if (!validation.ok && hasPlannerApiKey()) {
		for (let attempt = 0; attempt < 2 && !validation.ok; attempt += 1) {
			const replan = await tryLlmReplan(input, failures, validation);
			if (!replan) break;
			actions.push(replan.action);
			steps = [...steps, ...replan.steps];
			validation = replan.validation;
			failures = replan.failures;
			handoff = replan.handoff ?? handoff;

			// 无进展检测：重规划后失败原因和上一轮完全一致，换路线也没用，停
			const signature = failureSignature(failures, validation);
			if (!validation.ok && signature === lastSignature) {
				actions.push({ type: "abort", reason: "两轮失败原因相同，停止重规划" });
				return { steps, validation, handoff, actions };
			}
			lastSignature = signature;
		}
	}

	const agentProbe = getAgentProbe(input.probeResult);
	const cdpConnected = getCdpConnected(input.probeResult);
	const uitarsProbe = getUitarsProbe(input.probeResult);
	const workbuddyProbe = getWorkbuddyProbe(input.probeResult);
	const screenCaptureProbe = getScreenCaptureProbe(input.probeResult);
	const recoverySeed = buildRecoveryContext(
		{
			intent: input.intent,
			context: input.context,
			failures,
			validationFailed: !validation.ok,
			probeResult: input.probeResult,
			repairAttempts: 0,
			maxRepairAttempts: 1,
			screenshotSucceeded: screenshotSucceeded(steps),
		},
		agentProbe,
		cdpConnected,
		uitarsProbe,
		workbuddyProbe,
		screenCaptureProbe,
	);
	const maxAttempts = resolveRepairBudget(recoverySeed).maxAttempts;

	while (!validation.ok && repairAttempts < maxAttempts) {
		const action = handleFailure({
			...buildRecoveryContext(
				{
					intent: input.intent,
					context: input.context,
					failures,
					validationFailed: !validation.ok,
					probeResult: input.probeResult,
					repairAttempts,
					maxRepairAttempts: maxAttempts,
					screenshotSucceeded: screenshotSucceeded(steps),
				},
				agentProbe,
				cdpConnected,
				uitarsProbe,
				workbuddyProbe,
				screenCaptureProbe,
			),
		});
		if (!action) break;
		actions.push(action);
		if (action.type === "abort") break;

		repairAttempts += 1;
		input.emit({ status: "planning" });
		const repairPlan = buildRecoveryPlan(
			action,
			failures.map((failure) => `${failure.skill}: ${failure.error ?? "failed"}`),
		);
		input.emit({ status: "working" });
		const repairRun = await runPlan(repairPlan, input.skillCtx, input.emit);
		steps = [...steps, ...repairRun.steps];
		// 规则修复只验原目标；不能用 browser.page.ready 等无关规则盖掉主计划失败
		validation = validatePlan(input.plan, steps);
		failures = steps.filter((s): s is StepFailure => s.status === "failed");

		const agentOutput = repairRun.steps.find((s) => s.skill === "agent.execute")?.output as
			| { handoff?: SubagentHandoff }
			| undefined;
		handoff = agentOutput?.handoff;

		const signature = failureSignature(failures, validation);
		if (!validation.ok && signature === lastSignature) {
			actions.push({ type: "abort", reason: "修复后失败原因未变，停止重试" });
			break;
		}
		lastSignature = signature;
	}

	return { steps, validation, handoff, actions };
}
