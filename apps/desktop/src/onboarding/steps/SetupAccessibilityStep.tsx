import { useEffect, useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";
import { MARK_ASSET } from "../../brand/constants";

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

	const appLabel = ax?.appLabel === "Electron" ? "Electron（开发版知更）" : (ax?.appLabel ?? "知更");

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
				<div className="fold-onboarding-visual-card fold-onboarding-ax-card">
					<div className="fold-onboarding-ax-head">
						<span className="fold-onboarding-ax-symbol" aria-hidden="true">⌘</span>
						<div>
							<strong>辅助功能</strong>
							<p>允许知更控制键盘输入</p>
						</div>
					</div>
					<div className="fold-onboarding-ax-app">
						<img src={MARK_ASSET} alt="" />
						<span>{appLabel}</span>
						<span
							className={`fold-onboarding-ax-toggle${ax?.available ? " is-on" : ""}`}
							aria-label={ax?.available ? "已开启" : "待开启"}
						>
							<i />
						</span>
					</div>
					<p className="fold-onboarding-ax-tip">
						{ax?.available
							? "已开启，可以使用右 ⌘ 转写与代回"
							: "打开设置后，找到上面的应用并开启开关"}
					</p>
				</div>
			}
			footer={
				<>
					<OnboardingSecondaryBtn onClick={() => void window.fold.openAccessibilitySettings()}>
						打开辅助功能设置
					</OnboardingSecondaryBtn>
					<OnboardingPrimaryBtn onClick={onNext} disabled={!ax?.available}>
						{ax?.available ? "是的，继续" : "我已开启"}
					</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
