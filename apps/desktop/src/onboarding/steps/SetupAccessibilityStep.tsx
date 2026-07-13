import { useEffect, useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

export function SetupAccessibilityStep({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
	const [ax, setAx] = useState<Awaited<ReturnType<typeof window.fold.probeAccessibility>> | null>(null);

	useEffect(() => {
		let mounted = true;
		const poll = () => {
			void window.fold.probeAccessibility().then((result) => {
				if (mounted) setAx(result);
			});
		};
		poll();
		const timer = setInterval(poll, 2000);
		return () => {
			mounted = false;
			clearInterval(timer);
		};
	}, []);

	return (
		<OnboardingShell
			step="accessibility"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">开启辅助功能</h1>
					<p className="fold-onboarding-sub">
						知更需要辅助功能权限，才能把语音文字粘贴到你正在使用的 App 里。
					</p>
					<p className="fold-onboarding-hint">
						{ax?.available
							? `已授权「${ax.appLabel}」`
							: (ax?.error ?? "请在系统设置中开启辅助功能")}
					</p>
				</>
			}
			right={
				<div className="fold-onboarding-visual-card">
					<p className="text-[13px] text-[#1d1d1f]">系统设置 → 隐私与安全性 → 辅助功能</p>
					<p className="mt-2 text-[12px] text-[#86868b]">打开后，右 ⌘ 转写与代回才能正常工作。</p>
				</div>
			}
			footer={
				<>
					<OnboardingSecondaryBtn onClick={() => void window.fold.openAccessibilitySettings()}>
						打开系统设置
					</OnboardingSecondaryBtn>
					<OnboardingPrimaryBtn onClick={onNext} disabled={!ax?.available}>
						{ax?.available ? "是的，继续" : "我已开启"}
					</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
