import { useEffect, useState } from "react";
import { ComparePanel } from "../components/ComparePanel";
import { AppComposeMock } from "../components/AppComposeMock";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";
import { getOnboardingScenario } from "../onboarding-scenarios";

export function ProfileTeaserStep({
	onNext,
	onSkip,
	onBack,
}: {
	onNext: () => void;
	onSkip: () => void;
	onBack: () => void;
}) {
	const [demo, setDemo] = useState<Awaited<ReturnType<typeof window.fold.onboardingCompareDemo>> | null>(
		null,
	);

	useEffect(() => {
		void window.fold.onboardingCompareDemo({ withProfile: false }).then(setDemo);
	}, []);

	return (
		<OnboardingShell
			step="profile-teaser"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">还不认识你的时候</h1>
					<p className="fold-onboarding-sub">
						没导入记忆前，听写容易错词，代回也像客服腔。导入后会明显不同。
					</p>
					{demo ? (
						<ComparePanel
							incoming={demo.incoming as string}
							before={demo.before as { transcript: string; reply: string }}
							after={demo.after as { transcript: string; reply: string }}
							checklist={[]}
							showAfter={false}
						/>
					) : (
						<p className="fold-onboarding-hint">加载示例…</p>
					)}
				</>
			}
			right={
				demo ? (
					<AppComposeMock
						scenario={getOnboardingScenario("wechat")}
						incoming={demo.incoming as string}
						body={demo.before.reply as string}
					/>
				) : null
			}
			footer={
				<>
					<OnboardingSecondaryBtn onClick={onSkip}>稍后再说</OnboardingSecondaryBtn>
					<OnboardingPrimaryBtn onClick={onNext}>继承 AI 记忆</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
