import { useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

const LINE_A = "项目 A 的会议纪要链接：https://example.com/a";
const LINE_B = "项目 B 的会议纪要链接：https://example.com/b";

export function ClipboardDemoStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [offer, setOffer] = useState<{
		previous: { text: string; appName?: string };
		current: { text: string; appName?: string };
	} | null>(null);
	const [restored, setRestored] = useState(false);

	async function simulate() {
		const result = await window.fold.onboardingSimulateClipboard([LINE_A, LINE_B]);
		if (result.ok && result.previous && result.current) {
			setOffer({
				previous: result.previous as { text: string; appName?: string },
				current: result.current as { text: string; appName?: string },
			});
		}
	}

	async function restore() {
		if (!offer) return;
		await window.fold.restoreClipboard({ text: offer.previous.text });
		setRestored(true);
	}

	return (
		<OnboardingShell
			step="clipboard-demo"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">复制找回</h1>
					<p className="fold-onboarding-sub">
						知更一直在记你的复制历史。刚换复制内容时，会提示你找回上一段。
					</p>
					<div className="fold-onboarding-sample-box space-y-2">
						<p className="text-[12px]">1. 复制：{LINE_A}</p>
						<p className="text-[12px]">2. 再复制：{LINE_B}</p>
					</div>
					<OnboardingPrimaryBtn onClick={() => void simulate()}>模拟两次复制</OnboardingPrimaryBtn>
				</>
			}
			right={
				offer ? (
					<div className="fold-clipboard-recall-banner">
						<div className="fold-clipboard-recall-copy">
							<p className="fold-clipboard-recall-title">你刚换了复制内容</p>
							<p className="fold-clipboard-recall-sub">
								上一段来自 {offer.previous.appName ?? "其他 App"}，需要找回来吗？
							</p>
							<p className="fold-clipboard-recall-preview">{offer.previous.text}</p>
						</div>
						<div className="fold-clipboard-recall-actions">
							<button
								type="button"
								className="fold-clipboard-recall-btn is-primary"
								onClick={() => void restore()}
							>
								{restored ? "已恢复" : "恢复上一段"}
							</button>
						</div>
					</div>
				) : (
					<div className="fold-onboarding-visual-card">
						<p className="text-[12px] text-[#86868b]">点击左侧模拟复制覆盖</p>
					</div>
				)
			}
			footer={<OnboardingPrimaryBtn onClick={onNext} disabled={!offer}>继续</OnboardingPrimaryBtn>}
		/>
	);
}
