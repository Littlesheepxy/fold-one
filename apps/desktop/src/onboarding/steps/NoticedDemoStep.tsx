import { useEffect, useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";
import { NoticedCardMock } from "../components/NoticedCardMock";

export function NoticedDemoStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [text, setText] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		setLoading(true);
		setText("");
		const offChunk = window.fold.onAhaGuessChunk(({ chunk }) => {
			setText((prev) => prev + chunk);
		});
		const offDone = window.fold.onAhaGuessDone(() => setLoading(false));
		void window.fold.onboardingAhaGuess().finally(() => setLoading(false));
		return () => {
			offChunk();
			offDone();
		};
	}, []);

	const displayText =
		text || "你正在查看飞书文档《Q3 预算评审》，可能要回复相关同事。";

	return (
		<OnboardingShell
			step="noticed-demo"
			backdrop="context"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">知更 注意到了</h1>
					<p className="fold-onboarding-sub">不用开口，知更会根据你的情境猜测下一步。</p>
					<div className="fold-onboarding-aha-box">
						{loading && !text ? <p className="text-[#86868b]">正在理解你的情境…</p> : null}
						<p>{displayText}</p>
					</div>
				</>
			}
			right={
				<NoticedCardMock
					text={displayText}
					suggestions={["起草回复", "整理纪要"]}
				/>
			}
			footer={<OnboardingPrimaryBtn onClick={onNext}>继续</OnboardingPrimaryBtn>}
		/>
	);
}
