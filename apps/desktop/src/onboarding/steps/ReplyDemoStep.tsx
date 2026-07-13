import { useState } from "react";
import { AppComposeMock } from "../components/AppComposeMock";
import { OnboardingTitleRow } from "../components/OnboardingTitleRow";
import { ScenarioPicker } from "../components/ScenarioPicker";
import {
	OnboardingPrimaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";
import {
	getOnboardingScenario,
	type OnboardingScenarioId,
} from "../onboarding-scenarios";

export function ReplyDemoStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [scenarioId, setScenarioId] = useState<OnboardingScenarioId>("feishu");
	const scenario = getOnboardingScenario(scenarioId);

	return (
		<OnboardingShell
			step="reply-demo"
			onBack={onBack}
			left={
				<>
					<OnboardingTitleRow title="智能代回" hotkey="右 ⌘ 长按" />
					<p className="fold-onboarding-sub">在聊天或邮件旁浮出拟回复，一键插入。</p>
					<ScenarioPicker value={scenarioId} onChange={setScenarioId} />
					<div className="fold-onboarding-compare-card">
						<p className="text-[12px] text-[#86868b]">拟回复 · {scenario.label}</p>
						<p>{scenario.replyDraft}</p>
					</div>
				</>
			}
			right={
				<AppComposeMock
					scenario={scenario}
					incoming={scenario.replyIncoming}
					body={scenario.replyDraft}
					placeholder="按住右 ⌘ 说出你想怎么回…"
				/>
			}
			footer={<OnboardingPrimaryBtn onClick={onNext}>继续</OnboardingPrimaryBtn>}
		/>
	);
}
