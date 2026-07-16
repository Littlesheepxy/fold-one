import { useEffect, useState } from "react";
import { AppComposeMock } from "../components/AppComposeMock";
import { OnboardingTitleRow } from "../components/OnboardingTitleRow";
import { ScenarioPicker } from "../components/ScenarioPicker";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";
import {
	getOnboardingScenario,
	type OnboardingScenarioId,
} from "../onboarding-scenarios";

type VoicePhase = "idle" | "listening" | "formatting" | "done" | "error";

export function VoiceLiveStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [scenarioId, setScenarioId] = useState<OnboardingScenarioId>("feishu");
	const scenario = getOnboardingScenario(scenarioId);
	const [draft, setDraft] = useState(scenario.voiceSample);
	const [showingExample, setShowingExample] = useState(true);
	const [raw, setRaw] = useState<string | null>(null);
	const [cleaned, setCleaned] = useState<string | null>(null);
	const [phase, setPhase] = useState<VoicePhase>("idle");
	const [error, setError] = useState<string | null>(null);

	// 确保主进程 step 与本页一致，避免热重载后语音条路由错位
	useEffect(() => {
		void window.fold.onboardingSetStep("voice-live");
		void window.fold.onboardingSetVoiceApp(scenario.structureApp, scenario.header);
	}, [scenario.structureApp, scenario.header]);

	useEffect(() => {
		return window.fold.onOnboardingVoiceEvent((event) => {
			if (event.phase === "listening") {
				setPhase("listening");
				setError(null);
				setShowingExample(false);
				return;
			}
			if (event.phase === "formatting") {
				setPhase("formatting");
				if (event.raw) {
					setRaw(event.raw);
					setDraft(event.raw);
					setShowingExample(false);
				}
				return;
			}
			if (event.phase === "done") {
				setPhase("done");
				setShowingExample(false);
				if (event.raw) setRaw(event.raw);
				if (event.cleaned) {
					setCleaned(event.cleaned);
					setDraft(event.cleaned);
				}
				return;
			}
			if (event.phase === "error") {
				setPhase("error");
				setError(event.error ?? "语音整理失败");
			}
		});
	}, []);

	function switchScenario(id: OnboardingScenarioId) {
		const next = getOnboardingScenario(id);
		setScenarioId(id);
		if (!cleaned && (showingExample || phase === "idle")) {
			setDraft(next.voiceSample);
			setShowingExample(true);
			setRaw(null);
			setPhase("idle");
		}
	}

	const statusHint =
		phase === "listening"
			? "看屏幕底部中间的语音条，对着说…"
			: phase === "formatting"
				? "正在整理（按当前渠道语气）…"
				: phase === "done"
					? "已整理，可再改几个字"
					: "按下右 ⌘，屏幕底部会出现产品同款语音条；框里是示例，说你自己的会替换掉。";

	return (
		<OnboardingShell
			step="voice-live"
			onBack={onBack}
			left={
				<>
					<OnboardingTitleRow title="语音输入" hotkey="右 ⌘" />
					<p className="fold-onboarding-sub">
						用你自己的话说一段就行。知更会去掉「嗯 / 呃 / 那个」这类口头禅，并理顺说反了又改口的句子，只保留你的最终意思。
					</p>
					<ScenarioPicker value={scenarioId} onChange={switchScenario} />
					<p className="fold-onboarding-hint">{statusHint}</p>
					<div className="fold-onboarding-live-field">
						<p className="fold-onboarding-live-label">
							{showingExample ? `示例口述（${scenario.label}）` : phase === "done" ? "整理结果" : "内容"}
						</p>
						<textarea
							className={`fold-onboarding-live-input${showingExample ? " is-example" : ""}`}
							rows={5}
							value={draft}
							onChange={(e) => {
								setDraft(e.target.value);
								setShowingExample(false);
								if (phase === "done") setPhase("idle");
							}}
							disabled={phase === "listening" || phase === "formatting"}
						/>
					</div>
					{raw && cleaned && raw !== cleaned ? (
						<p className="fold-onboarding-hint">识别原文：{raw}</p>
					) : null}
					{error ? <p className="fold-onboarding-error">{error}</p> : null}
				</>
			}
			right={
				<AppComposeMock
					scenario={scenario}
					body={cleaned ?? (showingExample ? scenario.voiceCleaned : draft)}
					placeholder="按右 ⌘ 口述后，整理结果会出现在这里…"
				/>
			}
			footer={
				<>
					<OnboardingSecondaryBtn onClick={onNext}>跳过</OnboardingSecondaryBtn>
					<OnboardingPrimaryBtn onClick={onNext} disabled={!cleaned && showingExample}>
						继续
					</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
