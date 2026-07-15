export type PlanTier = "free" | "pro" | "ultra";

export type UpgradeReason =
	| "asr_accuracy"
	| "hotwords"
	| "smart_structure"
	| "context_reply"
	| "agent_execution";

export interface Entitlements {
	tier: PlanTier;
	localAsr: boolean;
	cloudAsr: boolean;
	hotwords: boolean;
	cloudStructure: boolean;
	cloudReply: boolean;
	hostedOcr: boolean;
	hostedPlanner: boolean;
	multiStepAgent: boolean;
	agentSubagents: boolean;
}

export const INITIAL_TRIAL_SMART_ACTIONS = 20;

export function normalizePlanTier(value: unknown): PlanTier {
	return value === "pro" || value === "ultra" ? value : "free";
}

export function resolveEntitlements(tierValue: unknown): Entitlements {
	const tier = normalizePlanTier(tierValue);
	const paid = tier === "pro" || tier === "ultra";
	const ultra = tier === "ultra";
	return {
		tier,
		localAsr: true,
		cloudAsr: paid,
		hotwords: paid,
		cloudStructure: paid,
		cloudReply: paid,
		hostedOcr: paid,
		hostedPlanner: paid,
		multiStepAgent: ultra,
		agentSubagents: ultra,
	};
}

export function remainingTrialSmartActions(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return INITIAL_TRIAL_SMART_ACTIONS;
	return Math.max(0, Math.floor(value));
}

export function canUseSmartAction(
	entitlements: Entitlements,
	trialRemaining: unknown,
	hasByok = false,
): boolean {
	return entitlements.tier !== "free" || hasByok || remainingTrialSmartActions(trialRemaining) > 0;
}

export function consumeTrialSmartAction(value: unknown): number {
	return Math.max(0, remainingTrialSmartActions(value) - 1);
}
