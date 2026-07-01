import type { ActionPlan } from "@fold/ai";
import type { AgentId, SubagentHandoff } from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import { isAgentSubagentsEnabled } from "@fold/connectors";
import type { ValidationResult } from "./validator.js";
import { runPlan, retryFailedSteps, type StepFailure } from "./executor.js";
import type { ProbeRunResult } from "./probe-runner.js";
import {
	buildRecoveryPlan,
	handleFailure,
	resolveRepairBudget,
	type RecoveryAction,
} from "./recovery.js";
import { validatePlan } from "./validator.js";
import type { SkillContext } from "@fold/skills";
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
		validation = validatePlan(repairPlan, repairRun.steps);
		failures = repairRun.failures;

		const agentOutput = repairRun.steps.find((s) => s.skill === "agent.execute")?.output as
			| { handoff?: SubagentHandoff }
			| undefined;
		handoff = agentOutput?.handoff;
	}

	return { steps, validation, handoff, actions };
}
