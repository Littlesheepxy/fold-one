export type OnboardingAct = "setup" | "inherit" | "experience" | "depart";

export type OnboardingStepId =
	| "accessibility"
	| "microphone"
	| "hotkey"
	| "voice-pack"
	| "profile-teaser"
	| "profile-import"
	| "profile-compare"
	| "voice-live"
	| "reply-demo"
	| "clipboard-demo"
	| "noticed-demo"
	| "summary";

export const STEP_ORDER: OnboardingStepId[] = [
	"accessibility",
	"microphone",
	"hotkey",
	"voice-pack",
	"profile-teaser",
	"profile-import",
	"profile-compare",
	"voice-live",
	"reply-demo",
	"clipboard-demo",
	"noticed-demo",
	"summary",
];

export function actForStep(step: OnboardingStepId): OnboardingAct {
	if (step === "accessibility" || step === "microphone" || step === "hotkey" || step === "voice-pack") {
		return "setup";
	}
	if (step === "profile-teaser" || step === "profile-import" || step === "profile-compare") {
		return "inherit";
	}
	if (step === "voice-live" || step === "reply-demo" || step === "clipboard-demo" || step === "noticed-demo") {
		return "experience";
	}
	return "depart";
}

export const ACT_LABELS: Record<OnboardingAct, string> = {
	setup: "设置",
	inherit: "继承",
	experience: "体验一下",
	depart: "出发",
};
