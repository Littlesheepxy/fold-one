import { useCallback, useEffect, useState } from "react";
import { STEP_ORDER, type OnboardingStepId } from "./types";
import { SetupAccessibilityStep } from "./steps/SetupAccessibilityStep";
import { SetupMicrophoneStep } from "./steps/SetupMicrophoneStep";
import { SetupHotkeyStep } from "./steps/SetupHotkeyStep";
import { VoicePackStep } from "./steps/VoicePackStep";
import { ProfileTeaserStep } from "./steps/ProfileTeaserStep";
import { ProfileImportStep } from "./steps/ProfileImportStep";
import { ProfileCompareStep } from "./steps/ProfileCompareStep";
import { VoiceLiveStep } from "./steps/VoiceLiveStep";
import { ReplyDemoStep } from "./steps/ReplyDemoStep";
import { ClipboardDemoStep } from "./steps/ClipboardDemoStep";
import { NoticedDemoStep } from "./steps/NoticedDemoStep";
import { SummaryStep } from "./steps/SummaryStep";

function stepIndex(step: OnboardingStepId): number {
	return STEP_ORDER.indexOf(step);
}

function resumeStep(saved?: string): OnboardingStepId {
	if (saved && STEP_ORDER.includes(saved as OnboardingStepId)) {
		return saved as OnboardingStepId;
	}
	return "accessibility";
}

export function OnboardingApp() {
	const [step, setStep] = useState<OnboardingStepId>("accessibility");
	const [skipConfirm, setSkipConfirm] = useState(false);
	const [profileSkipped, setProfileSkipped] = useState(false);

	useEffect(() => {
		void window.fold.onboardingGetState().then((state) => {
			setStep(resumeStep(state.step));
			setProfileSkipped(Boolean(state.profileImportSkippedAt && !state.profileImportedAt));
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

	const skipProfile = useCallback(() => {
		setSkipConfirm(true);
	}, []);

	const confirmSkipProfile = useCallback(() => {
		void window.fold.onboardingSkipProfile();
		setProfileSkipped(true);
		setSkipConfirm(false);
		goTo("voice-live");
	}, [goTo]);

	if (skipConfirm) {
		return (
			<div className="fold-onboarding-root">
				<div className="fold-onboarding-skip-dialog">
					<h2>稍后再导入画像？</h2>
					<p>可以跳过，但代回和猜测在最初几天会偏通用。你随时可在「记忆」里导入。</p>
					<div className="fold-onboarding-skip-actions">
						<button type="button" className="fold-onboarding-btn secondary" onClick={() => setSkipConfirm(false)}>
							返回导入
						</button>
						<button type="button" className="fold-onboarding-btn primary" onClick={confirmSkipProfile}>
							确认跳过
						</button>
					</div>
				</div>
			</div>
		);
	}

	switch (step) {
		case "accessibility":
			return <SetupAccessibilityStep onNext={goNext} />;
		case "microphone":
			return <SetupMicrophoneStep onNext={goNext} onBack={goBack} />;
		case "hotkey":
			return <SetupHotkeyStep onNext={goNext} onBack={goBack} />;
		case "voice-pack":
			return <VoicePackStep onNext={goNext} onBack={goBack} />;
		case "profile-teaser":
			return (
				<ProfileTeaserStep onNext={() => goTo("profile-import")} onSkip={skipProfile} onBack={goBack} />
			);
		case "profile-import":
			return (
				<ProfileImportStep
					onNext={() => goTo("profile-compare")}
					onBack={() => goTo("profile-teaser")}
				/>
			);
		case "profile-compare":
			return <ProfileCompareStep onNext={goNext} onBack={goBack} />;
		case "voice-live":
			return <VoiceLiveStep onNext={goNext} onBack={profileSkipped ? () => goTo("profile-teaser") : goBack} />;
		case "reply-demo":
			return <ReplyDemoStep onNext={goNext} onBack={goBack} />;
		case "clipboard-demo":
			return <ClipboardDemoStep onNext={goNext} onBack={goBack} />;
		case "noticed-demo":
			return <NoticedDemoStep onNext={goNext} onBack={goBack} />;
		case "summary":
			return <SummaryStep onFinish={finish} />;
		default:
			return <SetupAccessibilityStep onNext={goNext} />;
	}
}
