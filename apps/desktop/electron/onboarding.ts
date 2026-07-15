import { loadConfig, saveConfig } from "./config.js";

export interface OnboardingState {
	completedAt?: number;
	step?: string;
	profileImportedAt?: number;
	profileImportSkippedAt?: number;
}

export function getOnboardingState(): OnboardingState {
	return loadConfig().onboarding ?? {};
}

export function isOnboardingComplete(): boolean {
	return Boolean(getOnboardingState().completedAt);
}

export function setOnboardingStep(step: string): OnboardingState {
	const config = loadConfig();
	const onboarding: OnboardingState = { ...config.onboarding, step };
	saveConfig({ ...config, onboarding });
	return onboarding;
}

export function markProfileImported(): OnboardingState {
	const config = loadConfig();
	const onboarding: OnboardingState = {
		...config.onboarding,
		profileImportedAt: Date.now(),
		profileImportSkippedAt: undefined,
	};
	saveConfig({ ...config, onboarding });
	return onboarding;
}

export function markProfileImportSkipped(): OnboardingState {
	const config = loadConfig();
	const onboarding: OnboardingState = {
		...config.onboarding,
		profileImportSkippedAt: Date.now(),
	};
	saveConfig({ ...config, onboarding });
	return onboarding;
}

export function completeOnboarding(): OnboardingState {
	const config = loadConfig();
	const onboarding: OnboardingState = {
		...config.onboarding,
		completedAt: Date.now(),
		step: undefined,
	};
	saveConfig({ ...config, onboarding });
	return onboarding;
}

/** 开发测试：清除完成标记，从首步重新走引导 */
export function resetOnboardingForTest(step = "accessibility"): OnboardingState {
	const config = loadConfig();
	const onboarding: OnboardingState = {
		...config.onboarding,
		completedAt: undefined,
		step,
	};
	saveConfig({ ...config, onboarding });
	return onboarding;
}
