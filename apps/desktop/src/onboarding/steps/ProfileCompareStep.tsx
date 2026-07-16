import { useEffect, useState } from "react";
import { ComparePanel } from "../components/ComparePanel";
import { KeywordChips } from "../components/KeywordChips";
import { AppComposeMock } from "../components/AppComposeMock";
import {
	OnboardingPrimaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";
import { getOnboardingScenario } from "../onboarding-scenarios";

export function ProfileCompareStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [demo, setDemo] = useState<Awaited<ReturnType<typeof window.fold.onboardingCompareDemo>> | null>(
		null,
	);

	useEffect(() => {
		void window.fold.onboardingCompareDemo({ withProfile: true }).then(setDemo);
	}, []);

	const summary = demo?.profileSummary as
		| { role?: string; domains?: string[]; communicationStyle?: string }
		| undefined;

	return (
		<OnboardingShell
			step="profile-compare"
			backdrop="memory"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">同一条消息，知更怎么回？</h1>
					<p className="fold-onboarding-sub">导入前后对比：听写纠词 + 代回语气。</p>
					{summary?.role ? (
						<div className="fold-onboarding-profile-chips">
							{summary.role ? <span>{summary.role}</span> : null}
							{summary.domains?.map((d) => (
								<span key={d}>{d}</span>
							))}
							{summary.communicationStyle ? <span>{summary.communicationStyle}</span> : null}
						</div>
					) : null}
					{demo ? (
						<>
							<ComparePanel
								incoming={demo.incoming as string}
								before={demo.before as { transcript: string; reply: string }}
								after={demo.after as { transcript: string; reply: string }}
								checklist={(demo.checklist as string[]) ?? []}
							/>
							<KeywordChips keywords={(demo.keywords as string[]) ?? []} />
						</>
					) : (
						<p className="fold-onboarding-hint">生成对比…</p>
					)}
				</>
			}
			right={
				demo ? (
					<AppComposeMock
						scenario={getOnboardingScenario("wechat")}
						incoming={demo.incoming as string}
						body={demo.after.reply as string}
					/>
				) : null
			}
			footer={<OnboardingPrimaryBtn onClick={onNext}>继续体验</OnboardingPrimaryBtn>}
		/>
	);
}
