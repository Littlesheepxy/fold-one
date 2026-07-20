import { useCallback, useEffect, useState } from "react";
import { resumeOnboardingStep, STEP_ORDER, type OnboardingStepId } from "./types";
import { SetupAccessibilityStep } from "./steps/SetupAccessibilityStep";
import { SetupMicrophoneStep } from "./steps/SetupMicrophoneStep";
import { SetupHotkeyStep } from "./steps/SetupHotkeyStep";
import { KnowYouStep } from "./steps/KnowYouStep";
import { FirstReplyStep } from "./steps/FirstReplyStep";
import { SummaryStep } from "./steps/SummaryStep";

function stepIndex(step: OnboardingStepId): number {
	return STEP_ORDER.indexOf(step);
}

export function OnboardingApp() {
	const [step, setStep] = useState<OnboardingStepId>("accessibility");

	useEffect(() => {
		void window.fold.onboardingGetState().then((state) => {
			setStep(resumeOnboardingStep(state.step));
		});
	}, []);

	const goTo = useCallback((next: OnboardingStepId) => {
		setStep(next);
		void window.fold.onboardingSetStep(next);
	}, []);

	const goNext = useCallback(() => {
		const idx = stepIndex(step);
		const next = STEP_ORDER[idx + 1];
		if (next) goTo(next);
	}, [step, goTo]);

	const goBack = useCallback(() => {
		const idx = stepIndex(step);
		if (idx <= 0) return;
		goTo(STEP_ORDER[idx - 1]!);
	}, [step, goTo]);

	const finish = useCallback(() => {
		void window.fold.onboardingComplete();
	}, []);

	switch (step) {
		case "accessibility":
			return <SetupAccessibilityStep onNext={goNext} />;
		case "microphone":
			return <SetupMicrophoneStep onNext={goNext} onBack={goBack} />;
		case "hotkey":
			return <SetupHotkeyStep onNext={goNext} onBack={goBack} />;
		case "know-you":
			return <KnowYouStep onNext={goNext} onBack={goBack} />;
		case "first-reply":
			return <FirstReplyStep onNext={goNext} onBack={goBack} />;
		case "summary":
			return <SummaryStep onFinish={finish} />;
		default:
			return <SetupAccessibilityStep onNext={goNext} />;
	}
}
