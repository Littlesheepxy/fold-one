export type OnboardingAct = "setup" | "experience" | "depart";

export type OnboardingStepId =
	| "accessibility"
	| "microphone"
	| "hotkey"
	| "know-you"
	| "first-reply"
	| "summary"
	/** @deprecated 旧引导步，组件仍在仓库但不进 STEP_ORDER */
	| "voice-pack"
	| "profile-teaser"
	| "profile-import"
	| "profile-compare"
	| "voice-live"
	| "reply-demo"
	| "clipboard-demo"
	| "noticed-demo";

/** 精简引导：权限 → 麦 → 热键 → 词源 → 真实首次代回 → 出发 */
export const STEP_ORDER: OnboardingStepId[] = [
	"accessibility",
	"microphone",
	"hotkey",
	"know-you",
	"first-reply",
	"summary",
];

export function actForStep(step: OnboardingStepId): OnboardingAct {
	if (
		step === "accessibility" ||
		step === "microphone" ||
		step === "hotkey" ||
		step === "know-you"
	) {
		return "setup";
	}
	if (step === "first-reply") return "experience";
	return "depart";
}

export const ACT_LABELS: Record<OnboardingAct, string> = {
	setup: "设置",
	experience: "第一次代回",
	depart: "出发",
};

/** 旧断点续走：落到最近的有效步 */
export function resumeOnboardingStep(saved?: string): OnboardingStepId {
	if (saved && STEP_ORDER.includes(saved as OnboardingStepId)) {
		return saved as OnboardingStepId;
	}
	if (
		saved === "noticed-demo" ||
		saved === "clipboard-demo" ||
		saved === "summary"
	) {
		return "summary";
	}
	if (
		saved === "voice-pack" ||
		saved === "profile-teaser" ||
		saved === "profile-import" ||
		saved === "profile-compare" ||
		saved === "voice-live" ||
		saved === "reply-demo"
	) {
		return "first-reply";
	}
	return "accessibility";
}

/** ponytail: 旧断点映射 + 步数 */
export function runOnboardingResumeSelfCheck(): void {
	console.assert(STEP_ORDER.length === 6, "onboarding has 6 steps");
	console.assert(resumeOnboardingStep("reply-demo") === "first-reply", "legacy reply → first-reply");
	console.assert(resumeOnboardingStep("hotkey") === "hotkey", "keep hotkey");
	console.assert(resumeOnboardingStep("know-you") === "know-you", "keep know-you");
	console.assert(resumeOnboardingStep("noticed-demo") === "summary", "legacy noticed → summary");
	console.assert(actForStep("first-reply") === "experience", "first-reply act");
	console.assert(actForStep("know-you") === "setup", "know-you act");
}
