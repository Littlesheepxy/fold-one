import { useEffect, useState } from "react";
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
	const [insertedReply, setInsertedReply] = useState<string | null>(null);
	const scenario = getOnboardingScenario(scenarioId);

	useEffect(() => {
		void window.fold.onboardingSetVoiceApp(scenario.structureApp, scenario.header);
	}, [scenario.header, scenario.structureApp]);

	useEffect(() => {
		return window.fold.onOnboardingVoiceEvent((event) => {
			if (event.phase === "done" && event.cleaned) setInsertedReply(event.cleaned);
		});
	}, []);

	function switchScenario(id: OnboardingScenarioId) {
		setScenarioId(id);
		setInsertedReply(null);
	}

	return (
		<OnboardingShell
			step="reply-demo"
			onBack={onBack}
			left={
				<>
					<OnboardingTitleRow title="智能代回" hotkey="右 ⌘ 长按" />
					<p className="fold-onboarding-sub">
						先把光标放进右侧输入框，再长按右 ⌘ 说出你想怎么回。
					</p>
					<ScenarioPicker value={scenarioId} onChange={switchScenario} />
					<div className="fold-onboarding-compare-card">
						<p className="text-[12px] text-[#86868b]">2 · 试着这样说</p>
						<p>“{scenario.replyVoiceSample}”</p>
					</div>
				</>
			}
			right={
				<AppComposeMock
					scenario={scenario}
					incoming={scenario.replyIncoming}
					body={insertedReply ?? undefined}
					placeholder="输入消息…"
					composerGuide={insertedReply ? "建议已插入，可继续编辑" : "回复会插入这里"}
				/>
			}
			footer={<OnboardingPrimaryBtn onClick={onNext}>继续</OnboardingPrimaryBtn>}
		/>
	);
}
