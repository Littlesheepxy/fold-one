import { useEffect, useState } from "react";
import { OnboardingTitleRow } from "../components/OnboardingTitleRow";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

/**
 * 真实首次代回：不走 mock 插入。
 * 用户切到微信/飞书等，长按右 ⌘ → 选草案 → 真正贴进输入框后才能继续。
 */
export function FirstReplyStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [succeeded, setSucceeded] = useState(false);
	const [hint, setHint] = useState("打开任意聊天，点进输入框");

	useEffect(() => {
		void window.fold.onboardingSetStep("first-reply");
		// 清掉旧 demo 的伪 App 锚定，走真实前台
		void window.fold.onboardingSetVoiceApp("", "");
	}, []);

	useEffect(() => {
		return window.fold.onState((state) => {
			if (state.status === "done" && state.result === "已插入回复") {
				setSucceeded(true);
				setHint("已插入真实对话，可以继续");
			}
			if (state.status === "predict" && state.predictSurface === "reply") {
				setHint("选一条草案，点插入");
			}
			if (state.status === "listening" || state.status === "formatting") {
				setHint("正在听你说…");
			}
		});
	}, []);

	return (
		<OnboardingShell
			step="first-reply"
			onBack={onBack}
			backdrop="context"
			left={
				<>
					<OnboardingTitleRow title="第一次真实代回" hotkey="右 ⌘ 长按" />
					<p className="fold-onboarding-sub">
						切到微信、飞书或钉钉任意对话，点进输入框，长按右 ⌘ 说你想怎么回，再选一条插入。
					</p>
					<ol className="fold-onboarding-compare-card space-y-2 text-[13px] text-[#1d1d1f]">
						<li>1. 切到真实聊天窗口</li>
						<li>2. 长按右 ⌘，说一句意图（例如「答应周五给」）</li>
						<li>3. 选草案 → 插入到输入框</li>
					</ol>
					<p className="fold-onboarding-hint mt-3">{hint}</p>
					{succeeded ? (
						<p className="fold-onboarding-hint" style={{ color: "#248a3d" }}>
							完成了——这就是知更以后每天帮你做的事。
						</p>
					) : null}
				</>
			}
			right={
				<div className="fold-onboarding-compare-card" style={{ padding: 20 }}>
					<p className="text-[12px] text-[#86868b] mb-2">为什么不是演示？</p>
					<p className="text-[13px] leading-relaxed text-[#1d1d1f]">
						演示插到假输入框里没有感觉。只有贴进你真正在聊的窗口，才算激活。
					</p>
					<p className="text-[12px] text-[#86868b] mt-4">
						稍后可在设置里导入画像、下载离线语音包。
					</p>
				</div>
			}
			footer={
				succeeded ? (
					<OnboardingPrimaryBtn onClick={onNext}>继续</OnboardingPrimaryBtn>
				) : (
					<div className="flex flex-col gap-2 w-full">
						<OnboardingPrimaryBtn disabled onClick={() => {}}>
							插入成功后可继续
						</OnboardingPrimaryBtn>
						<OnboardingSecondaryBtn onClick={onNext}>稍后再试，先进入</OnboardingSecondaryBtn>
					</div>
				)
			}
		/>
	);
}
